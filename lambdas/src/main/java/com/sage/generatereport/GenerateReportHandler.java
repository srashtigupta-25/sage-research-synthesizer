package com.sage.generatereport;

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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class GenerateReportHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private final BedrockRuntimeClient bedrock = BedrockRuntimeClient.builder()
            .region(Region.US_EAST_1)
            .build();

    private final ObjectMapper mapper = new ObjectMapper();
    private static final String MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        try {
            String reportId = (String) event.get("reportId");
            String topic = (String) event.get("topic");

            List<Map<String, Object>> researchResults =
                (List<Map<String, Object>>) event.get("researchResults");

            StringBuilder researchText = new StringBuilder();
            for (Map<String, Object> result : researchResults) {
                researchText.append("Q: ").append(result.get("question")).append("\n");
                researchText.append("A: ").append(result.get("answer")).append("\n\n");
            }

            // Detect custom length instructions from topic
            String lengthInstruction = "350-450 words";
            String topicLower = topic.toLowerCase();

            // Page-based requests
            if (topicLower.contains("1 page") || topicLower.contains("one page")) {
                lengthInstruction = "250-300 words (1 page)";
            } else if (topicLower.contains("2 page") || topicLower.contains("two page")) {
                lengthInstruction = "500-600 words (2 pages)";
            } else if (topicLower.contains("3 page") || topicLower.contains("three page")) {
                lengthInstruction = "750-900 words (3 pages)";
            } else if (topicLower.contains("4 page") || topicLower.contains("four page")) {
                lengthInstruction = "1000-1200 words (4 pages)";
            } else if (topicLower.contains("5 page") || topicLower.contains("five page")) {
                lengthInstruction = "1200-1500 words (5 pages)";
            }

            // Word-count requests e.g. "500 word report"
            Pattern wordPattern = Pattern.compile("(\\d+)\\s*word");
            Matcher wordMatcher = wordPattern.matcher(topicLower);
            if (wordMatcher.find()) {
                int requested = Integer.parseInt(wordMatcher.group(1));
                requested = Math.max(150, Math.min(1500, requested));
                lengthInstruction = "approximately " + requested + " words";
            }

            // Style keywords
            if (topicLower.contains("brief report") || topicLower.contains("short report") || topicLower.contains("quick report")) {
                lengthInstruction = "200-250 words - very concise";
            } else if (topicLower.contains("detailed report") || topicLower.contains("comprehensive report") || topicLower.contains("in-depth report")) {
                lengthInstruction = "800-1000 words - comprehensive";
            } else if (topicLower.contains("executive summary") || topicLower.contains("executive report")) {
                lengthInstruction = "150-200 words - executive summary format";
            }

            context.getLogger().log("Length instruction: " + lengthInstruction);

            String prompt = "You are a senior analyst writing an intelligence brief.\n\n" +
                "Topic: '" + topic + "'\n\n" +
                "LENGTH REQUIREMENT: " + lengthInstruction + ".\n" +
                "CRITICAL: Count your words as you write. Stop writing when you reach the target. Do NOT exceed it.\n\n" +
                "RULES:\n" +
                "- Write for busy professionals who need facts not fluff\n" +
                "- Every sentence must contain a specific fact, number, or insight\n" +
                "- Plain text only. No markdown. No bullet points.\n\n" +
                "FORMAT:\n" +
                "- Start with report title in CAPS\n" +
                "- Use domain-appropriate CAPS section headers\n" +
                "- Scale number of sections to match requested length\n" +
                "- End with KEY TAKEAWAY section\n\n" +
                "Research:\n" + researchText;

            Map<String, Object> requestBody = Map.of(
                "anthropic_version", "bedrock-2023-05-31",
                "max_tokens", 2000,
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
            String reportText = (String) content.get(0).get("text");

            context.getLogger().log("Report generated, length: " + reportText.length());

            return Map.of(
                "reportId", reportId,
                "topic", topic,
                "reportText", reportText,
                "researchResults", researchResults
            );

        } catch (Exception e) {
            context.getLogger().log("Error generating report: " + e.getMessage());
            throw new RuntimeException(e);
        }
    }
}
