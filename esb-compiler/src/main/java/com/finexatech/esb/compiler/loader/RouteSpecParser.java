package com.finexatech.esb.compiler.loader;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.finexatech.esb.spec.RouteSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Parses a YAML RouteSpec file into a RouteSpec POJO.
 * Uses Jackson YAML — no additional frameworks needed.
 */
@Component
public class RouteSpecParser {

    private static final Logger log = LoggerFactory.getLogger(RouteSpecParser.class);
    private final ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());

    public RouteSpec parse(Path yamlFile) {
        try {
            log.debug("Parsing route spec: {}", yamlFile);
            RouteSpec spec = yamlMapper.readValue(yamlFile.toFile(), RouteSpec.class);
            log.info("Parsed route spec: {}", spec.routeName());
            return spec;
        } catch (Exception e) {
            throw new RouteSpecParseException("Failed to parse route spec: " + yamlFile, e);
        }
    }

    public RouteSpec parse(InputStream inputStream, String sourceName) {
        try {
            log.debug("Parsing route spec from stream: {}", sourceName);
            return yamlMapper.readValue(inputStream, RouteSpec.class);
        } catch (Exception e) {
            throw new RouteSpecParseException("Failed to parse route spec: " + sourceName, e);
        }
    }

    public RouteSpec parseString(String yaml, String sourceName) {
        try {
            return yamlMapper.readValue(yaml, RouteSpec.class);
        } catch (Exception e) {
            throw new RouteSpecParseException("Failed to parse route spec: " + sourceName, e);
        }
    }

    public static class RouteSpecParseException extends RuntimeException {
        public RouteSpecParseException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
