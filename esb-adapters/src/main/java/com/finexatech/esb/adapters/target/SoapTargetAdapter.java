package com.finexatech.esb.adapters.target;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finexatech.esb.compiler.assembly.TargetAdapter;
import com.finexatech.esb.spec.AuthSpec;
import com.finexatech.esb.spec.TargetSpec;
import com.finexatech.esb.spec.TimeoutSpec;
import org.apache.camel.Exchange;
import org.apache.camel.Processor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Calls a SOAP endpoint via HTTP POST with SOAPAction header.
 *
 * Demo note: uses Camel HTTP component (not full CXF proxy generation).
 * Production upgrade path: swap buildToUri() to CXF URI with WSDL proxy.
 *
 * YAML: target.type = "soap"
 */
@Component
public class SoapTargetAdapter implements TargetAdapter {

    private static final Logger       log         = LoggerFactory.getLogger(SoapTargetAdapter.class);
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

    @Override
    public String protocol() { return "soap"; }

    @Override
    public String buildToUri(TargetSpec spec) {
        String url     = resolve(spec.getEndpointUrl());
        TimeoutSpec to = spec.getTimeout() != null ? spec.getTimeout() : new TimeoutSpec();

        // Strip protocol prefix — Camel http component adds it
        String hostPath = url.replaceFirst("^https?://", "");

        // Choose http or https component based on URL
        String scheme = url.startsWith("https") ? "https" : "http";

        // bridgeEndpoint=true: don't append source path to target URL
        return "%s://%s?throwExceptionOnFailure=true&bridgeEndpoint=true&connectTimeout=%d&socketTimeout=%d"
            .formatted(scheme, hostPath, to.getConnectMs(), to.getReadMs());
    }

    @Override
    public Processor preProcessor(TargetSpec spec) {
        return exchange -> {
            // SOAP requires POST
            exchange.getIn().setHeader(Exchange.HTTP_METHOD, "POST");
            exchange.getIn().setHeader("Content-Type", "text/xml; charset=utf-8");

            // Clear incoming path headers so Camel does NOT append the REST source path
            // to the target endpoint URL. bridgeEndpoint=true suppresses HTTP_URI override
            // but HTTP_PATH is still read by the HTTP producer — must remove it explicitly.
            exchange.getIn().removeHeader(Exchange.HTTP_PATH);
            exchange.getIn().removeHeader(Exchange.HTTP_URI);
            exchange.getIn().removeHeader(Exchange.HTTP_QUERY);

            // SOAPAction header (required by most SOAP services)
            if (spec.getOperation() != null) {
                exchange.getIn().setHeader("SOAPAction",
                    "\"" + spec.getOperation() + "\"");
                log.debug("SOAPAction set to: {}", spec.getOperation());
            }

            // Basic auth if configured
            AuthSpec auth = spec.getAuth();
            if (auth != null && "basic".equalsIgnoreCase(auth.getType())) {
                String creds = resolve(auth.getUsername()) + ":" + resolve(auth.getPassword());
                String encoded = Base64.getEncoder().encodeToString(creds.getBytes());
                exchange.getIn().setHeader("Authorization", "Basic " + encoded);
            }
        };
    }

    @Override
    public Processor postProcessor(TargetSpec spec) {
        return exchange -> {
            String body = exchange.getIn().getBody(String.class);
            if (body == null || body.isBlank()) return;

            // Check for SOAP Fault before any further processing
            if (body.contains(":Fault>") || body.contains("<Fault>")) {
                String faultMsg = extractFaultMessage(body);
                log.warn("SOAP Fault received for operation {}: {}", spec.getOperation(), faultMsg);
                throw new SoapFaultException("SOAP Fault from " + spec.getOperation() + ": " + faultMsg);
            }

            // Convert SOAP XML → JSON so downstream Jolt transforms see consistent JSON
            try {
                String json = soapXmlToJson(body);
                exchange.getIn().setBody(json);
                exchange.getIn().setHeader("Content-Type", "application/json");
                log.debug("SOAP XML→JSON: {} chars → {} chars", body.length(), json.length());
            } catch (Exception e) {
                log.warn("SOAP XML→JSON conversion failed, passing raw body: {}", e.getMessage());
            }
        };
    }

    /**
     * Parses a SOAP envelope and extracts the soap:Body content as JSON.
     * Uses JDK DOM parser — no extra dependencies.
     * Output: {"ResponseElementName": {"field": "value", ...}}
     */
    private String soapXmlToJson(String soapXml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        // Security: disable external entity processing (XXE protection)
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);

        DocumentBuilder builder = factory.newDocumentBuilder();
        Document document = builder.parse(new InputSource(new StringReader(soapXml)));

        // Find soap:Body using wildcard namespace match
        NodeList bodyElements = document.getElementsByTagNameNS("*", "Body");
        if (bodyElements.getLength() == 0) {
            // Fallback: try without namespace
            bodyElements = document.getElementsByTagName("Body");
        }
        if (bodyElements.getLength() == 0) {
            log.warn("No SOAP Body element found — returning raw XML as JSON string");
            return JSON_MAPPER.writeValueAsString(Map.of("rawResponse", soapXml));
        }

        Node bodyNode = bodyElements.item(0);
        Node responseElement = firstElementChild(bodyNode);
        if (responseElement == null) {
            return "{}";
        }

        // Wrap response element by its local name so Jolt specs can reference it
        String elementName = responseElement.getLocalName() != null
            ? responseElement.getLocalName() : responseElement.getNodeName();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put(elementName, nodeToObject(responseElement));
        return JSON_MAPPER.writeValueAsString(result);
    }

    /** Returns the first ELEMENT_NODE child, skipping text/comment nodes. */
    private Node firstElementChild(Node parent) {
        Node child = parent.getFirstChild();
        while (child != null && child.getNodeType() != Node.ELEMENT_NODE) {
            child = child.getNextSibling();
        }
        return child;
    }

    /** Recursively converts a DOM Node to a Map or String. */
    private Object nodeToObject(Node node) {
        NodeList children = node.getChildNodes();
        Map<String, Object> map = new LinkedHashMap<>();

        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child.getNodeType() != Node.ELEMENT_NODE) continue;
            String key = child.getLocalName() != null ? child.getLocalName() : child.getNodeName();
            map.put(key, nodeToObject(child));
        }

        if (map.isEmpty()) {
            // Leaf node — return trimmed text content
            return node.getTextContent().trim();
        }
        return map;
    }

    private String resolve(String value) {
        if (value == null) return "";
        if (value.startsWith("${") && value.endsWith("}")) {
            String key = value.substring(2, value.length() - 1);
            String env = System.getenv(key);
            return env != null ? env : System.getProperty(key, value);
        }
        return value;
    }

    private String extractFaultMessage(String soapBody) {
        // Simple extraction — good enough for demo
        int start = soapBody.indexOf("<faultstring>");
        int end   = soapBody.indexOf("</faultstring>");
        if (start >= 0 && end > start) {
            return soapBody.substring(start + "<faultstring>".length(), end);
        }
        return "Unknown SOAP Fault";
    }

    public static class SoapFaultException extends RuntimeException {
        public SoapFaultException(String message) { super(message); }
    }
}
