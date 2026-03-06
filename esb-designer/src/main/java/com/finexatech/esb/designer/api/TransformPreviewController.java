package com.finexatech.esb.designer.api;

import com.finexatech.esb.designer.service.TransformPreviewService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/manage/transforms")
public class TransformPreviewController {

    private final TransformPreviewService service;

    public TransformPreviewController(TransformPreviewService service) {
        this.service = service;
    }

    /**
     * POST /manage/transforms/preview
     * Always returns HTTP 200; errors are encoded in the response body.
     */
    @PostMapping("/preview")
    public TransformPreviewResponse preview(@RequestBody TransformPreviewRequest req) {
        try {
            String output = switch (req.getType()) {
                case "jolt"   -> service.previewJolt(req.getSpec(), req.getInput());
                case "xslt"   -> service.previewXslt(req.getSpec(), req.getInput());
                case "groovy" -> service.previewGroovy(req.getSpec(), req.getInput(), req.getHeaders());
                default       -> throw new IllegalArgumentException("Unsupported transform type: " + req.getType());
            };
            return TransformPreviewResponse.ok(output);
        } catch (Exception e) {
            return TransformPreviewResponse.fail(e.getMessage());
        }
    }
}
