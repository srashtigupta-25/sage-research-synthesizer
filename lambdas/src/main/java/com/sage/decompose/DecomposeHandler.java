package com.sage.decompose;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;
import software.amazon.awssdk.services.bedrockruntime.model.InvokeModelRequest;
import software.amazon.awssdk.services.bedrockruntime.model.InvokeModelResponse;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DecomposeHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private final BedrockRuntimeClient bedrock = BedrockRuntimeClient.builder()
            .region(Region.US_EAST_1)
            .build();

    private final ObjectMapper mapper = new ObjectMapper();
    private static final String MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        try {
            String topic = (String) event.get("topic");
            String reportId = (String) event.get("reportId");

            context.getLogger().log("Decompose received topic length: " + topic.length());
            context.getLogger().log("Is document: " + topic.startsWith("[DOCUMENT ANALYSIS REQUEST]"));

            boolean isDocument = topic.startsWith("[DOCUMENT ANALYSIS REQUEST]") || topic.length() > 500;
            String prompt;
            String displayTopic = topic;

            if (isDocument) {
                String userQuestion = "";
                String fileName = "document";
                String documentContent = topic;

                if (topic.startsWith("[DOCUMENT ANALYSIS REQUEST]")) {
                    String[] lines = topic.split("\n", 6);
                    for (String line : lines) {
                        if (line.startsWith("User Question: ")) {
                            userQuestion = line.substring("User Question: ".length()).trim();
                        } else if (line.startsWith("File: ")) {
                            fileName = line.substring("File: ".length()).trim();
                        }
                    }
                    int contentStart = topic.indexOf("Document Content:\n");
                    if (contentStart >= 0) {
                        documentContent = topic.substring(contentStart + "Document Content:\n".length());
                    }
                    displayTopic = userQuestion.isEmpty() ? "Document: " + fileName : userQuestion + " [" + fileName + "]";
                }

                context.getLogger().log("Document content length: " + documentContent.length());

                String questionContext = userQuestion.isEmpty()
                    ? "Generate 3 comprehensive analysis questions about this " + fileName + " document."
                    : "The user asked: '" + userQuestion + "'. Generate 3 focused sub-questions that answer this using the document.";

                prompt = "You are a senior analyst. Analyze ONLY the actual content in this document.\n\n" +
                    "CRITICAL: Base ALL questions on what is LITERALLY in the document.\n\n" +
                    questionContext + "\n\n" +
                    "Rules:\n" +
                    "- Reference specific functions, variables, sections you actually see\n" +
                    "- Each question must be answerable from this document only\n" +
                    "- Return ONLY a raw JSON array of exactly 3 strings, no markdown\n\n" +
                    "Document content:\n" + documentContent + "\n\n" +
                    "Generate 3 specific analysis questions as a JSON array:";
            } else {
                prompt = "You are a senior research analyst. Break down this research topic " +
                    "into exactly 3 precise, non-overlapping sub-questions.\n\n" +
                    "Rules:\n" +
                    "- Each question must explore a DIFFERENT dimension\n" +
                    "- Return ONLY a raw JSON array of exactly 3 strings, no markdown\n\n" +
                    "Now decompose this topic: " + topic;
            }

            Map<String, Object> requestBody = Map.of(
                "anthropic_version", "bedrock-2023-05-31",
                "max_tokens", 600,
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

            List<Map<String, Object>> content = (List<Map<String, Object>>) responseBody.get("content");
            String claudeText = (String) content.get(0).get("text");

            String cleanedText = claudeText
                .replaceAll("```json", "")
                .replaceAll("```", "")
                .trim();

            List<String> subQuestions = mapper.readValue(cleanedText, List.class);
            context.getLogger().log("Sub-questions generated: " + subQuestions);

            // Return original full topic so research Lambda can access document content
            Map<String, Object> result = new HashMap<>();
            result.put("reportId", reportId);
            result.put("topic", topic);           // FULL original topic with document content
            result.put("displayTopic", displayTopic); // Short display version
            result.put("subQuestions", subQuestions);
            return result;

        } catch (Exception e) {
            context.getLogger().log("Error in decompose: " + e.getMessage());
            throw new RuntimeException(e);
        }
    }
}
