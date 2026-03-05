package com.finexatech.esb;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.finexatech.esb")
public class EsbApplication {
    public static void main(String[] args) {
        SpringApplication.run(EsbApplication.class, args);
    }
}
