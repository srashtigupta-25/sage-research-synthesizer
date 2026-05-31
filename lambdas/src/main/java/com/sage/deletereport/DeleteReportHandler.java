package com.sage.deletereport;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;

import java.util.HashMap;
import java.util.Map;

public class DeleteReportHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private final DynamoDbClient dynamoDB = DynamoDbClient.builder()
            .region(Region.US_EAST_1)
            .build();

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent event, Context context) {
        try {
            String reportId = event.getPathParameters().get("reportId");

            if (reportId == null || reportId.isBlank()) {
                return response(400, Map.of("error", "reportId is required"));
            }

            Map<String, AttributeValue> key = new HashMap<>();
            key.put("reportId", AttributeValue.fromS(reportId));

            GetItemResponse existing = dynamoDB.getItem(GetItemRequest.builder()
                .tableName("SageReports")
                .key(key)
                .build());

            if (!existing.hasItem()) {
                return response(404, Map.of("error", "Report not found"));
            }

            dynamoDB.deleteItem(DeleteItemRequest.builder()
                .tableName("SageReports")
                .key(key)
                .build());

            context.getLogger().log("Deleted report: " + reportId);

            return response(200, Map.of(
                "message", "Report deleted successfully",
                "reportId", reportId
            ));

        } catch (Exception e) {
            context.getLogger().log("Error deleting report: " + e.getMessage());
            return response(500, Map.of("error", e.getMessage()));
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
                .withBody("{\"error\":\"serialization failed\"}");
        }
    }
}
