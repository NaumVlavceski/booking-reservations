package com.naumvlavceski.bookingbackend.admin;

import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** C1: with APP_ADMIN_MAIL_FROM empty (the default) the app runs and Send email answers 409. */
class AdminSendEmailDisabledTest extends AdminTestBase {

    @Test
    void withoutASenderSendEmailIsOff() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        admin(get("/api/admin/emails/config"), admin, session, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
        admin(post("/api/admin/emails/send"), admin, session,
                "{\"to\":\"a@example.test\",\"subject\":\"Hi\",\"message\":\"Text\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ADMIN_MAIL_DISABLED"));
    }
}
