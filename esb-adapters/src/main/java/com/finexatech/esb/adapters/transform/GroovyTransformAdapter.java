package com.finexatech.esb.adapters.transform;

import com.finexatech.esb.compiler.assembly.TransformAdapter;
import com.finexatech.esb.spec.TransformItemSpec;
import groovy.lang.GroovyShell;
import org.apache.camel.Processor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Applies an inline Groovy script as a Camel Processor.
 *
 * YAML: transform.request.type = "groovy"
 *       transform.request.inline = "..."
 *
 * Variables available in the script:
 *   body     — String  — the raw message body (may be empty for GET requests)
 *   headers  — Map<String, Object> — all Camel message headers
 *              Camel captures REST path params here, e.g. headers['accountId']
 *   exchange — org.apache.camel.Exchange — full exchange (advanced use)
 *
 * The script's return value becomes the new message body.
 * If the script returns null, the body is left unchanged.
 *
 * Example — build SOAP envelope from a REST path param:
 *   def id = headers['accountId'] ?: 'UNKNOWN'
 *   """<soap:Envelope ...><soap:Body><GetBalance><id>${id}</id>..."""
 */
@Component
public class GroovyTransformAdapter implements TransformAdapter {

    private static final Logger log = LoggerFactory.getLogger(GroovyTransformAdapter.class);

    @Override
    public String type() { return "groovy"; }

    @Override
    public Processor buildProcessor(TransformItemSpec spec) {
        String script = spec.getInline() != null && !spec.getInline().isBlank()
                ? spec.getInline()
                : "body"; // default: passthrough

        return exchange -> {
            GroovyShell shell = new GroovyShell();
            shell.setVariable("body",     exchange.getIn().getBody(String.class));
            shell.setVariable("headers",  exchange.getIn().getHeaders());
            shell.setVariable("exchange", exchange);

            log.debug("Running Groovy transform, body-length={}",
                      exchange.getIn().getBody(String.class) != null
                          ? exchange.getIn().getBody(String.class).length() : 0);

            Object result = shell.evaluate(script);
            if (result != null) {
                exchange.getIn().setBody(result.toString());
                log.debug("Groovy transform output: {} chars", result.toString().length());
            }
        };
    }
}
