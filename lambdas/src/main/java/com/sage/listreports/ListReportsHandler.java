package com.sage.listreports;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

public class ListReportsHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private final DynamoDbClient dynamoDB = DynamoDbClient.builder()
            .region(Region.US_EAST_1)
            .build();

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent event, Context context) {
        try {
            // Extract userId from JWT
            String userId = extractUserId(event);
            context.getLogger().log("Listing reports for userId: " + userId);

            // Scan DynamoDB for reports belonging to this user
            ScanResponse result = dynamoDB.scan(ScanRequest.builder()
                .tableName("SageReports")
                .filterExpression("userId = :uid")
                .expressionAttributeValues(Map.of(
                    ":uid", AttributeValue.fromS(userId)
                ))
                .projectionExpression("reportId, topic, #s, createdAt")
                .expressionAttributeNames(Map.of("#s", "status"))
                .build());

            List<Map<String, Object>> reports = new ArrayList<>();
            for (Map<String, AttributeValue> item : result.items()) {
                if ("COMPLETE".equals(item.get("status") != null ? item.get("status").s() : "")) {
                    Map<String, Object> report = new java.util.HashMap<>();
                    report.put("reportId", item.get("reportId").s());
                    report.put("topic", item.containsKey("topic") ? item.get("topic").s() : "");
                    report.put("status", item.containsKey("status") ? item.get("status").s() : "");
                    reports.add(report);
                }
            }

            context.getLogger().log("Found " + reports.size() + " reports for user");

            return response(200, Map.of("reports", reports, "userId", userId));

        } catch (Exception e) {
            context.getLogger().log("Error listing reports: " + e.getMessage());
            return response(500, Map.of("error", e.getMessage()));
        }
    }

    private String extractUserId(APIGatewayProxyRequestEvent event) {
        try {
            Map<String, Object> authorizer = (Map<String, Object>) event.getRequestContext().getAuthorizer();
            if (authorizer != null && authorizer.containsKey("claims")) {
                Map<String, String> claims = (Map<String, String>) authorizer.get("claims");
                return claims.getOrDefault("sub", "anonymous");
            }
            String authHeader = event.getHeaders().get("Authorization");
            if (authHeader != null) {
                String[] parts = authHeader.split("\\.");
                if (parts.length >= 2) {
                    String payload = new String(Base64.getUrlDecoder().decode(parts[1]));
                    Map<String, Object> claims = mapper.readValue(payload, Map.class);
                    return (String) claims.getOrDefault("sub", "anonymous");
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return "anonymous";
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
                .withBody("{\"error\":\"serialization failed\"}");
        }
    }
}
