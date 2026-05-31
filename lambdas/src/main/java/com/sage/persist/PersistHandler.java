package com.sage.persist;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

// This Lambda is Step 5 — saves the completed report to DynamoDB and marks it COMPLETE
public class PersistHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    // DynamoDB client
    private final DynamoDbClient dynamoDB = DynamoDbClient.builder()
            .region(Region.US_EAST_1)
            .build();

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        try {
            // Extract everything from the pipeline
            String reportId = (String) event.get("reportId");
            String reportText = (String) event.get("reportText");
            List<String> imageUrls = (List<String>) event.get("imageUrls");
            List<Map<String, Object>> researchResults =
                (List<Map<String, Object>>) event.get("researchResults");

            // Build the key — tells DynamoDB which item to update
            Map<String, AttributeValue> key = new HashMap<>();
            key.put("reportId", AttributeValue.fromS(reportId));

            // Convert image URLs list to DynamoDB List type
            List<AttributeValue> imageUrlAttrs = imageUrls.stream()
                .map(AttributeValue::fromS)  // Each URL is a String attribute
                .collect(Collectors.toList());

            // Convert research results to a JSON string for storage
            String researchJson = mapper.writeValueAsString(researchResults);

            // Build the update expression — sets all fields and changes status to COMPLETE
            Map<String, AttributeValue> values = new HashMap<>();
            values.put(":reportText", AttributeValue.fromS(reportText));
            values.put(":imageUrls", AttributeValue.fromL(imageUrlAttrs)); // L = List in DynamoDB
            values.put(":researchResults", AttributeValue.fromS(researchJson));
            values.put(":status", AttributeValue.fromS("COMPLETE")); // Mark as done

            // Update the existing DynamoDB item
            dynamoDB.updateItem(UpdateItemRequest.builder()
                .tableName("SageReports")
                .key(key)
                .updateExpression(
                    "SET reportText = :reportText, " +
                    "imageUrls = :imageUrls, " +
                    "researchResults = :researchResults, " +
                    "#s = :status"  // #s is an alias because "status" is a reserved word
                )
                .expressionAttributeNames(Map.of("#s", "status")) // Alias for reserved word
                .expressionAttributeValues(values)
                .build());

            context.getLogger().log("Report " + reportId + " marked COMPLETE");

            // Return final confirmation
            return Map.of(
                "reportId", reportId,
                "status", "COMPLETE"
            );

        } catch (Exception e) {
            context.getLogger().log("Error persisting report: " + e.getMessage());
            throw new RuntimeException(e);
        }
    }
}
