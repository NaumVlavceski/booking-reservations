package com.naumvlavceski.bookingbackend.admin;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Admin tests: the real filter chain and database. The step-up code generator is replaced so tests know the code
 * without it ever being logged; {@link #CODE} is what it returns.
 */
public abstract class AdminTestBase extends AuditTestBase {
    protected static final String CODE = "246810";

    @Autowired protected JdbcTemplate jdbc;
    @MockitoBean protected AdminCodeGenerator codeGenerator;

    @BeforeEach
    void fixedCode() {
        when(codeGenerator.next()).thenReturn(CODE);
    }

    protected UUID userId(TestOwner owner) {
        return jdbc.queryForObject("SELECT id FROM app_user WHERE lower(email) = lower(?)", UUID.class, owner.email());
    }

    /** A fresh owner with is_admin = true (set directly, as the real admin is set by hand in the database). */
    protected TestOwner newAdmin() throws Exception {
        TestOwner owner = newOwner();
        jdbc.update("UPDATE app_user SET is_admin = TRUE WHERE lower(email) = lower(?)", owner.email());
        return owner;
    }

    protected ResultActions admin(MockHttpServletRequestBuilder req, TestOwner owner, String session, String json)
            throws Exception {
        if (session != null) req.header(AdminSessionService.HEADER, session);
        if (json != null) req.contentType(MediaType.APPLICATION_JSON).content(json);
        if (owner != null) req.header("Authorization", "Bearer " + owner.token());
        return mvc.perform(req);
    }

    /** Requests a code, verifies it and returns the admin session token. */
    protected String openSession(TestOwner admin) throws Exception {
        admin(post("/api/admin/auth/request-code"), admin, null, null).andExpect(status().isAccepted());
        String json = body(admin(post("/api/admin/auth/verify-code"), admin, null, "{\"code\":\"" + CODE + "\"}")
                .andExpect(status().isOk()));
        return JsonPath.read(json, "$.sessionToken");
    }
}
