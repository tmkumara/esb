package com.finexatech.esb.compiler.validation;

public enum ValidationLayer {
    STRUCTURAL,     // field presence, format, numeric ranges
    SCHEMA,         // enum values, known types
    SEMANTIC,       // external resources exist (files, env vars)
    COMPATIBILITY,  // source ↔ target compatibility
    DRY_RUN         // actual Camel compile attempt
}
