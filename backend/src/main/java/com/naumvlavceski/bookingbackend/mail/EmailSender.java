package com.naumvlavceski.bookingbackend.mail;

public interface EmailSender {
    String send(EmailMessage m);
}
