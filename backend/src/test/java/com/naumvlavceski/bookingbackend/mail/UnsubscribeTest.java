package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UnsubscribeTest {

    @Autowired MockMvc mvc;
    @Autowired UnsubscribeLinks links;
    @Autowired OwnerRepository owners;

    @Test
    void tokenRoundTripsAndRejectsTampering() {
        UUID id = UUID.randomUUID();
        String token = links.token(id);
        assertEquals(id, links.verify(token).orElseThrow());

        assertTrue(links.verify(token + "x").isEmpty());
        String otherOwnersId = links.token(UUID.randomUUID()).split("[.]")[0];
        assertTrue(links.verify(otherOwnersId + "." + token.split("[.]")[1]).isEmpty(),
                "signature of one owner must not work for another");
        assertTrue(links.verify("garbage").isEmpty());
        assertTrue(links.verify(null).isEmpty());
    }

    @Test
    void getOnlyConfirmsAndPostUnsubscribesWithoutLogin() throws Exception {
        Owner owner = new Owner();
        owner = owners.save(owner);
        String token = links.token(owner.getId());

        mvc.perform(get("/api/notifications/unsubscribe").param("token", token))
                .andExpect(status().isOk()).andExpect(content().string(containsString("<form")));
        assertTrue(owners.findById(owner.getId()).orElseThrow().isNotificationsEnabled(),
                "a link scanner opening the page must not unsubscribe anyone");

        mvc.perform(post("/api/notifications/unsubscribe").param("token", token))
                .andExpect(status().isOk()).andExpect(content().string(containsString("unsubscribed")));
        assertFalse(owners.findById(owner.getId()).orElseThrow().isNotificationsEnabled());

        mvc.perform(post("/api/notifications/unsubscribe").param("token", "bad.token"))
                .andExpect(status().isBadRequest());
        owners.deleteById(owner.getId());
    }
}
