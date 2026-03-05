package com.finexatech.esb.runtime.service;

import com.bazaarvoice.jolt.Chainr;
import com.bazaarvoice.jolt.JsonUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import groovy.lang.GroovyShell;
import org.springframework.stereotype.Service;

import javax.xml.transform.Source;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.stream.StreamResult;
import javax.xml.transform.stream.StreamSource;
import java.io.StringReader;
import java.io.StringWriter;

@Service
public class TransformPreviewService {

    private final ObjectMapper objectMapper = new ObjectMapper();

    public String previewJolt(String specJson, String inputJson) throws Exception {
        Object specObj = JsonUtils.jsonToObject(specJson);
        Chainr chainr  = Chainr.fromSpec(specObj);
        Object output  = chainr.transform(JsonUtils.jsonToObject(inputJson));
        return objectMapper.writerWithDefaultPrettyPrinter()
                           .writeValueAsString(objectMapper.readTree(JsonUtils.toJsonString(output)));
    }

    public String previewXslt(String xsltSource, String xmlInput) throws Exception {
        TransformerFactory factory = TransformerFactory.newInstance();
        Source xslt = new StreamSource(new StringReader(xsltSource));
        Transformer transformer = factory.newTransformer(xslt);
        StringWriter writer = new StringWriter();
        transformer.transform(new StreamSource(new StringReader(xmlInput)), new StreamResult(writer));
        return writer.toString();
    }

    public String previewGroovy(String script, String input, java.util.Map<String, String> headers) throws Exception {
        GroovyShell shell = new GroovyShell();
        shell.setVariable("body",    input);
        shell.setVariable("headers", headers != null ? headers : new java.util.HashMap<>());
        // exchange not available in preview — bind null so scripts referencing it fail clearly
        shell.setVariable("exchange", null);
        Object result = shell.evaluate(script);
        return result != null ? result.toString() : "";
    }
}
