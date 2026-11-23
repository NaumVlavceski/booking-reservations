package com.naumvlavceski.bookingbackend.mail;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A2: with RESEND_WEBHOOK_SECRET empty (the default) the webhook answers 404, as if it did not exist. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ResendWebhookDisabledTest {
    @Autowired MockMvc mvc;

    @Test
    void withoutASecretTheEndpointDoesNotExist() throws Exception {
        mvc.perform(post("/api/webhooks/resend").contentType(MediaType.APPLICATION_JSON)
                        .content(ResendWebhookIntegrationTest.event("email.delivered", "re_x"))
                        .header("svix-id", "msg_1").header("svix-timestamp", "1").header("svix-signature", "v1,AAAA"))
                .andExpect(status().isNotFound());
    }
}
