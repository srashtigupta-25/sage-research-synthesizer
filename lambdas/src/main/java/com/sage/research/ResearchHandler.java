package com.sage.research;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;
import software.amazon.awssdk.services.bedrockruntime.model.InvokeModelRequest;
import software.amazon.awssdk.services.bedrockruntime.model.InvokeModelResponse;

import java.util.List;
import java.util.Map;

public class ResearchHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private final BedrockRuntimeClient bedrock = BedrockRuntimeClient.builder()
            .region(Region.US_EAST_1)
            .build();

    private final ObjectMapper mapper = new ObjectMapper();
    private static final String MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        try {
            String question = (String) event.get("question");
            String reportId = (String) event.get("reportId");

            String originalTopic = (String) event.getOrDefault("topic", "");

            // CRITICAL LOGGING - tells us exactly what we receive
            context.getLogger().log("=== RESEARCH DEBUG ===");
            context.getLogger().log("Topic length: " + originalTopic.length());
            context.getLogger().log("Topic starts with: " + originalTopic.substring(0, Math.min(50, originalTopic.length())));
            context.getLogger().log("Is document: " + originalTopic.startsWith("[DOCUMENT ANALYSIS REQUEST]"));
            context.getLogger().log("Has Document Content marker: " + originalTopic.contains("Document Content:"));

            String documentContent = "";
            if (originalTopic.startsWith("[DOCUMENT ANALYSIS REQUEST]")) {
                int contentStart = originalTopic.indexOf("Document Content:\n");
                context.getLogger().log("Content start index: " + contentStart);
                if (contentStart >= 0) {
                    documentContent = originalTopic.substring(contentStart + "Document Content:\n".length());
                    context.getLogger().log("Document content length: " + documentContent.length());
                    context.getLogger().log("Document content preview: " + documentContent.substring(0, Math.min(100, documentContent.length())));
                }
            }

            String prompt;
            if (!documentContent.isEmpty()) {
                context.getLogger().log("Using DOCUMENT mode");
                prompt = "You are a senior analyst. Answer this question using ONLY the provided document content.\n\n" +
                    "Question: " + question + "\n\n" +
                    "Rules:\n" +
                    "- Answer based ONLY on what is in the document, not general knowledge\n" +
                    "- Reference specific parts, functions, or sections from the document\n" +
                    "- Write 3 focused paragraphs\n" +
                    "- Be precise and specific to the actual document content\n" +
                    "- Plain text only, no markdown, no bullet points\n\n" +
                    "Document content:\n" + documentContent;
            } else {
                context.getLogger().log("Using GENERAL RESEARCH mode - no document content found");
                prompt = "You are a senior research analyst writing for an intelligent professional audience.\n\n" +
                    "Answer this research question with depth and precision:\n" + question + "\n\n" +
                    "Guidelines:\n" +
                    "- Write 3 focused paragraphs\n" +
                    "- Paragraph 1: Core concept or mechanism with specific details\n" +
                    "- Paragraph 2: Real-world implementation, examples, or evidence\n" +
                    "- Paragraph 3: Implications, trade-offs, or advanced considerations\n" +
                    "- Use specific facts, numbers, and named examples where possible\n" +
                    "- Plain text only, no markdown, no bullet points, no headers";
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

            List<Map<String, Object>> content = (List<Map<String, Object>>) responseBody.get("content");
            String answer = (String) content.get(0).get("text");

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
}
