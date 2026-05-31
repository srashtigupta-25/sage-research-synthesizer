package com.sage.orchestrator;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.sfn.SfnClient;
import software.amazon.awssdk.services.sfn.model.StartExecutionRequest;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class OrchestratorHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private final DynamoDbClient dynamoDB = DynamoDbClient.builder()
            .region(software.amazon.awssdk.regions.Region.US_EAST_1)
            .build();

    private final SfnClient sfnClient = SfnClient.builder()
            .region(software.amazon.awssdk.regions.Region.US_EAST_1)
            .build();

    private final ObjectMapper mapper = new ObjectMapper();

    private static final String STATE_MACHINE_ARN =
            "arn:aws:states:us-east-1:758854590072:stateMachine:SagePipeline";

    // Vague single concepts that can't produce a focused report
    private static final List<String> VAGUE_TOPICS = List.of(
        "life", "everything", "nothing", "stuff", "things", "world",
        "universe", "reality", "existence", "society", "humans", "people",
        "nature", "time", "space", "love", "happiness", "success",
        "ai", "technology", "science", "history", "business", "money",
        "health", "food", "sports", "music", "art", "education"
    );

    // Prefixes that make a vague topic look like a question but are still too broad
    private static final List<String> VAGUE_PREFIXES = List.of(
        "what is ", "tell me about ", "explain ", "describe ",
        "what are ", "talk about ", "write about "
    );

    // Real-time data keywords
    private static final List<String> REALTIME_KEYWORDS = List.of(
        "stock price", "current price", "price today", "price now",
        "today's price", "live price", "market price right now",
        "current rate", "exchange rate today", "weather today",
        "news today", "breaking news", "latest news", "right now",
        "at this moment", "currently trading", "market cap today",
        "score today", "result today", "live score"
    );

    // Personal advice keywords
    private static final List<String> PERSONAL_KEYWORDS = List.of(
        "should i", "should i take", "should i buy", "should i sell",
        "what should i do", "is it good for me", "help me decide",
        "my job offer", "my life", "my relationship", "my career path",
        "my investment", "my portfolio", "my salary negotiation",
        "am i right to", "what do you think i should", "advise me personally"
    );

    // Inappropriate content keywords - broad enough to catch variations
    private static final List<String> INAPPROPRIATE_KEYWORDS = List.of(
        "how to hack", "how to exploit",
        "make a bomb", "make bomb", "build a bomb", "build bomb",
        "bomb making", "bomb recipe",
        "synthesize drugs", "drug synthesis", "how to make meth",
        "how to kill", "how to murder",
        "malware tutorial", "write malware", "create ransomware",
        "ransomware", "how to attack a", "illegal weapons",
        "weapon making", "how to make a gun illegally"
    );

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent event, Context context) {
        try {
            Map<String, String> body = mapper.readValue(event.getBody(), Map.class);
            String topic = body.get("topic");

            // Check 1 - topic must exist
            if (topic == null || topic.isBlank()) {
                return response(400, Map.of(
                    "error", "MISSING_TOPIC",
                    "message", "Please provide a topic to research."
                ));
            }

            // Trim and normalize
            topic = topic.trim();
            String topicLower = topic.toLowerCase();

            // Check 2 - minimum length
            if (topic.length() < 10) {
                return response(400, Map.of(
                    "error", "TOPIC_TOO_SHORT",
                    "message", "Your topic is too short. Please provide a more specific research question.",
                    "example", "Try: 'How does Kubernetes manage container orchestration'"
                ));
            }

            // Check 3 - maximum length
            if (topic.length() > 400) {
                return response(400, Map.of(
                    "error", "TOPIC_TOO_LONG",
                    "message", "Please keep your topic under 400 characters.",
                    "tip", "Focus on one specific question rather than multiple questions at once."
                ));
            }

            // Check 4 - reject vague topics
            // Strip common prefixes and check the core subject
            String strippedTopic = topicLower;
            for (String prefix : VAGUE_PREFIXES) {
                if (topicLower.startsWith(prefix)) {
                    strippedTopic = topicLower.substring(prefix.length()).trim();
                    break;
                }
            }
            for (String vague : VAGUE_TOPICS) {
                if (strippedTopic.equals(vague) || strippedTopic.equals(vague + "?") ||
                    strippedTopic.equals(vague + ".")) {
                    return response(400, Map.of(
                        "error", "TOPIC_TOO_VAGUE",
                        "message", "This topic is too broad for a focused research report.",
                        "tip", "Narrow it down to a specific question or concept.",
                        "examples", List.of(
                            "How does the transformer architecture power modern AI systems",
                            "What caused the 2008 global financial crisis",
                            "How does CRISPR gene editing work in practice"
                        )
                    ));
                }
            }

            // Check 5 - reject real-time data requests
            for (String keyword : REALTIME_KEYWORDS) {
                if (topicLower.contains(keyword)) {
                    return response(400, Map.of(
                        "error", "REALTIME_DATA_REQUEST",
                        "message", "Sage generates research reports from established knowledge and cannot provide live or real-time data.",
                        "tip", "For live data use Bloomberg, Yahoo Finance, or Google News.",
                        "suggestion", "Rephrase as a research question. Instead of 'Apple stock price today' try 'Apple business model and competitive position'"
                    ));
                }
            }

            // Check 6 - reject personal advice requests
            for (String keyword : PERSONAL_KEYWORDS) {
                if (topicLower.contains(keyword)) {
                    return response(400, Map.of(
                        "error", "PERSONAL_ADVICE_REQUEST",
                        "message", "Sage generates objective research reports and cannot provide personalized advice.",
                        "tip", "Rephrase as a general research question.",
                        "example", "Instead of 'Should I invest in Nvidia' try 'Nvidia investment thesis and risk factors 2025'"
                    ));
                }
            }

            // Check 7 - reject inappropriate content
            for (String keyword : INAPPROPRIATE_KEYWORDS) {
                if (topicLower.contains(keyword)) {
                    return response(400, Map.of(
                        "error", "INAPPROPRIATE_TOPIC",
                        "message", "This topic cannot be researched through Sage.",
                        "tip", "Please submit a constructive research question."
                    ));
                }
            }

            // All checks passed - create the report
            String reportId = UUID.randomUUID().toString();

            Map<String, AttributeValue> item = new HashMap<>();
            item.put("reportId", AttributeValue.fromS(reportId));
            item.put("topic", AttributeValue.fromS(topic));
            item.put("status", AttributeValue.fromS("PENDING"));

            dynamoDB.putItem(PutItemRequest.builder()
                    .tableName("SageReports")
                    .item(item)
                    .build());

            String sfInput = mapper.writeValueAsString(Map.of(
                    "reportId", reportId,
                    "topic", topic
            ));

            sfnClient.startExecution(StartExecutionRequest.builder()
                    .stateMachineArn(STATE_MACHINE_ARN)
                    .input(sfInput)
                    .build());

            context.getLogger().log("Started pipeline for reportId: " + reportId + " topic: " + topic);

            return response(200, Map.of(
                    "reportId", reportId,
                    "status", "PENDING",
                    "message", "Your report is being generated. Poll GET /reports/" + reportId + " for results."
            ));

        } catch (Exception e) {
            context.getLogger().log("Error: " + e.getMessage());
            return response(500, Map.of("error", "INTERNAL_ERROR", "message", e.getMessage()));
        }
    }

    private APIGatewayProxyResponseEvent response(int statusCode, Object body) {
        try {
            return new APIGatewayProxyResponseEvent()
                    .withStatusCode(statusCode)
                    .withHeaders(Map.of("Access-Control-Allow-Origin", "*"))
                    .withBody(mapper.writeValueAsString(body));
        } catch (Exception e) {
            return new APIGatewayProxyResponseEvent()
                    .withStatusCode(500)
                    .withBody("{\"error\":\"response serialization failed\"}");
        }
    }
}
