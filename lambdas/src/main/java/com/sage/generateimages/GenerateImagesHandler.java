package com.sage.generateimages;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import java.util.List;
import java.util.Map;

// This Lambda is Step 4 - returns placeholder image URLs until image generation is available
public class GenerateImagesHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        try {
            String reportId = (String) event.get("reportId");
            String topic = (String) event.get("topic");
            String reportText = (String) event.get("reportText");
            List<Map<String, Object>> researchResults =
                (List<Map<String, Object>>) event.get("researchResults");

            context.getLogger().log("Skipping image generation - using placeholders for reportId: " + reportId);

            // Placeholder images until an active Bedrock image model is available
            List<String> imageUrls = List.of(
                "https://placehold.co/512x512/1a1a2e/ffffff?text=Sage+Report+Image+1",
                "https://placehold.co/512x512/16213e/ffffff?text=Sage+Report+Image+2"
            );

            // Pass everything forward including placeholder URLs
            return Map.of(
                "reportId", reportId,
                "topic", topic,
                "reportText", reportText,
                "researchResults", researchResults,
                "imageUrls", imageUrls
            );

        } catch (Exception e) {
            context.getLogger().log("Error in generate images: " + e.getMessage());
            throw new RuntimeException(e);
        }
    }
}
