package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.*;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

/**
 * The one password rule, shared by registration and password reset. 72 is BCrypt's input limit.
 * Each part reports its own message, so errors read the same as before ("Password size must be between 8 and 72").
 * MaxUtf8Bytes (audit API-02): BCrypt's limit is in bytes, so non-Latin passwords get a clear field error too.
 */
@NotBlank
@Size(min = 8, max = 72)
@MaxUtf8Bytes(72)
@Documented
@Constraint(validatedBy = {})
@Target({METHOD, FIELD, ANNOTATION_TYPE, CONSTRUCTOR, PARAMETER, TYPE_USE})
@Retention(RUNTIME)
public @interface ValidPassword {
    String message() default "is not a valid password";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
