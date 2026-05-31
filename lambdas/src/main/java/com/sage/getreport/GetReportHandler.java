package com.sage.getreport;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

// This Lambda handles GET /reports/{reportId} - frontend polls this every 3 seconds
public class GetReportHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private final DynamoDbClient dynamoDB = DynamoDbClient.builder()
            .region(Region.US_EAST_1)
            .build();

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent event, Context context) {
        try {
            // Extract reportId from the URL path - /reports/{reportId}
            String reportId = event.getPathParameters().get("reportId");

            if (reportId == null || reportId.isBlank()) {
                return response(400, Map.of("error", "reportId is required"));
            }

            // Build the key to look up in DynamoDB
            Map<String, AttributeValue> key = new HashMap<>();
            key.put("reportId", AttributeValue.fromS(reportId));

            // Fetch the item from DynamoDB
            GetItemResponse result = dynamoDB.getItem(GetItemRequest.builder()
                .tableName("SageReports")
                .key(key)
                .build());

            // If no item found, return 404
            if (!result.hasItem()) {
                return response(404, Map.of("error", "Report not found"));
            }

            Map<String, AttributeValue> item = result.item();

            // Build response safely - check each attribute exists before reading it
            Map<String, Object> report = new HashMap<>();

            // reportId is always present - it's the partition key
            report.put("reportId", item.get("reportId").s());

            // topic - safely read with null check
            report.put("topic", item.containsKey("topic") ? item.get("topic").s() : "Unknown topic");

            // status - safely read with null check
            String status = item.containsKey("status") ? item.get("status").s() : "PENDING";
            report.put("status", status);

            // Only include report text and images if the report is COMPLETE
            if ("COMPLETE".equals(status)) {

                // reportText - safely read
                if (item.containsKey("reportText")) {
                    report.put("reportText", item.get("reportText").s());
                }

                // imageUrls - convert DynamoDB List back to Java List
                if (item.containsKey("imageUrls")) {
                    List<String> imageUrls = item.get("imageUrls").l().stream()
                        .map(AttributeValue::s)
                        .collect(Collectors.toList());
                    report.put("imageUrls", imageUrls);
                }
            }

            context.getLogger().log("Fetched report: " + reportId + " status: " + status);
            return response(200, report);

        } catch (Exception e) {
            context.getLogger().log("Error getting report: " + e.getMessage());
            return response(500, Map.of("error", e.getMessage()));
        }
    }

    // Helper method - builds API Gateway response
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
