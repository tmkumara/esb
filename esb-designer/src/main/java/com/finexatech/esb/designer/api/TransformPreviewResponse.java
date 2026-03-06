package com.finexatech.esb.designer.api;

public class TransformPreviewResponse {
    private boolean success;
    private String output;
    private String error;

    private TransformPreviewResponse() {}

    public static TransformPreviewResponse ok(String output) {
        TransformPreviewResponse r = new TransformPreviewResponse();
        r.success = true;
        r.output  = output;
        return r;
    }

    public static TransformPreviewResponse fail(String error) {
        TransformPreviewResponse r = new TransformPreviewResponse();
        r.success = false;
        r.error   = error;
        return r;
    }

    public boolean isSuccess() { return success; }
    public String getOutput()  { return output; }
    public String getError()   { return error; }
}
