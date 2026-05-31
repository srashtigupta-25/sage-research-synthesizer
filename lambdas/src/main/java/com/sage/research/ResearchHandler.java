package com.sage.research;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;
import software.amazon.awssdk.services.bedrockruntime.model.InvokeModelRequest;
import software.amazon.awssdk.services.bedrockruntime.model.InvokeModelResponse;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;

public class ResearchHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private final BedrockRuntimeClient bedrock = BedrockRuntimeClient.builder()
            .region(Region.US_EAST_1)
            .build();

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private static final String MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        try {
            String question = (String) event.get("question");
            String reportId = (String) event.get("reportId");

            context.getLogger().log("Researching: " + question);

            // Step 1 - Search web with Tavily
            String searchContext = searchWithTavily(question, context);

            // Step 2 - Research with Claude using web results as context
            String answer = researchWithClaude(question, searchContext, context);

            context.getLogger().log("Research answer length: " + answer.length());

            return Map.of(
                "reportId", reportId,
                "question", question,
                "answer", answer
            );

        } catch (Exception e) {
            context.getLogger().log("Error in research: " + e.getMessage());
            throw new RuntimeException(e);
        }
    }

    private String searchWithTavily(String query, Context context) {
        try {
            String tavilyKey = System.getenv("TAVILY_API_KEY");
            if (tavilyKey == null || tavilyKey.isBlank()) {
                context.getLogger().log("No Tavily key found - skipping web search");
                return "";
            }

            // Build Tavily search request
            Map<String, Object> tavilyRequest = Map.of(
                "query", query,
                "max_results", 5,
                "search_depth", "advanced",
                "include_answer", true
            );

            String requestBody = mapper.writeValueAsString(tavilyRequest);

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.tavily.com/search"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + tavilyKey)
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

            HttpResponse<String> response = httpClient.send(
                request, HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() != 200) {
                context.getLogger().log("Tavily error: " + response.statusCode() + " " + response.body());
                return "";
            }

            // Parse Tavily response
            Map<String, Object> tavilyResponse = mapper.readValue(response.body(), Map.class);

            StringBuilder searchContext = new StringBuilder();

            // Add Tavily's direct answer if available
            String tavilyAnswer = (String) tavilyResponse.get("answer");
            if (tavilyAnswer != null && !tavilyAnswer.isBlank()) {
                searchContext.append("SEARCH SUMMARY: ").append(tavilyAnswer).append("\n\n");
            }

            // Add individual search results
            List<Map<String, Object>> results = (List<Map<String, Object>>) tavilyResponse.get("results");
            if (results != null) {
                searchContext.append("WEB SOURCES:\n");
                for (int i = 0; i < Math.min(results.size(), 5); i++) {
                    Map<String, Object> result = results.get(i);
                    String title = (String) result.get("title");
                    String content = (String) result.get("content");
                    String url = (String) result.get("url");
                    if (title != null && content != null) {
                        searchContext.append("\nSource ").append(i + 1).append(": ").append(title).append("\n");
                        searchContext.append("URL: ").append(url).append("\n");
                        searchContext.append("Content: ").append(content).append("\n");
                    }
                }
            }

            context.getLogger().log("Tavily search successful, context length: " + searchContext.length());
            return searchContext.toString();

        } catch (Exception e) {
            context.getLogger().log("Tavily search failed: " + e.getMessage());
            return "";
        }
    }

    private String researchWithClaude(String question, String searchContext, Context context) {
        try {
            String prompt;

            if (!searchContext.isBlank()) {
                // Use web search results as grounding
                prompt = "You are a senior research analyst. Answer this question using " +
                    "the provided web search results for accuracy and current information.\n\n" +
                    "Question: " + question + "\n\n" +
                    "Web Search Results:\n" + searchContext + "\n\n" +
                    "Guidelines:\n" +
                    "- Base your answer on the web search results above\n" +
                    "- Include specific facts, numbers, dates from the sources\n" +
                    "- Write 3 focused paragraphs\n" +
                    "- Paragraph 1: Direct answer with key facts from search results\n" +
                    "- Paragraph 2: Supporting evidence and specific details\n" +
                    "- Paragraph 3: Context, implications, or analysis\n" +
                    "- Plain text only, no markdown, no bullet points\n" +
                    "- If search results contain current/recent information, prioritize it";
            } else {
                // Fallback to Claude's training data
                prompt = "You are a senior research analyst. Answer this question " +
                    "with depth and precision.\n\n" +
                    "Question: " + question + "\n\n" +
                    "Guidelines:\n" +
                    "- Write 3 focused paragraphs\n" +
                    "- Use specific facts, numbers, and named examples\n" +
                    "- Plain text only, no markdown, no bullet points";
            }

            Map<String, Object> requestBody = Map.of(
                "anthropic_version", "bedrock-2023-05-31",
                "max_tokens", 1000,
                "messages", List.of(Map.of("role", "user", "content", prompt))
            );

            byte[] requestBytes = mapper.writeValueAsBytes(requestBody);
            InvokeModelResponse response = bedrock.invokeModel(
                InvokeModelRequest.builder()
                    .modelId(MODEL_ID)
                    .contentType("application/json")
                    .accept("application/json")
                    .body(SdkBytes.fromByteArray(requestBytes))
                    .build()
            );

            Map<String, Object> responseBody = mapper.readValue(
                response.body().asByteArray(), Map.class
            );

            List<Map<String, Object>> content =
                (List<Map<String, Object>>) responseBody.get("content");
            return (String) content.get(0).get("text");

        } catch (Exception e) {
            context.getLogger().log("Claude research failed: " + e.getMessage());
            throw new RuntimeException(e);
        }
    }
}
