package com.finexatech.esb.designer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.finexatech.esb")
public class EsbDesignerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EsbDesignerApplication.class, args);
    }
}
