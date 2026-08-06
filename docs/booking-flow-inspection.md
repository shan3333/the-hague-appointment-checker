# The Hague booking-flow inspection

Inspected on 2026-08-06 for product 35. The inspection selected an offered date
and time, navigated to the personal-data form, and closed the isolated browser
without submitting a booking. No real personal data was entered.

## Observed personal-data fields

| Label | Name | ID | Type | Required | Placeholder | Pattern | Options |
|---|---|---|---|---|---|---|---|
| Voorletters | empty | `field_0_0` | text | yes | empty | empty | n/a |
| Voornaam | empty | `field_1_0` | text | no | empty | empty | n/a |
| Tussenvoegsels | empty | `field_2_0` | text | no | empty | empty | n/a |
| Achternaam | empty | `field_3_0` | text | yes | empty | empty | n/a |
| Straatnaam | empty | `field_4_0` | text | yes | empty | empty | n/a |
| Huisnummer | empty | `field_5_0` | text | yes | empty | empty | n/a |
| Toevoeging | empty | `field_6_0` | text | no | empty | empty | n/a |
| Plaatsnaam | empty | `field_7_0` | text | yes | empty | empty | n/a |
| E-mailadres | empty | `field-default-8_0` | email | yes | empty | empty | n/a |
| Geboortedatum (dd-mm-jjjj) | empty | `field_9_0` | text | yes | empty | empty | n/a |
| Mobiel nummer | empty | `field_10_0` | tel | yes | empty | empty | n/a |

The DOM exposed no `pattern` attributes or dropdowns on this form. Browser-native
email validation applies to the email input. The displayed birth-date format is
`dd-mm-jjjj`. The observed IDs may be provider-generated, so a future automation
must verify both ID and visible label before filling.

## Security and downstream stages

- CAPTCHA: not present on the observed personal-data page.
- Email verification: not present on the observed personal-data page.
- SMS verification: not present on the observed personal-data page.
- Payment: not present on the observed personal-data page.
- DigiD: not present on the observed personal-data page.
- Confirmation page: downstream stage not verified. The slot disappeared before
  a separate synthetic-data inspection could reach it. No final confirmation or
  booking control was clicked.

These findings apply only through the observed data-entry step. They must not be
interpreted as proof that a later stage cannot introduce verification, CAPTCHA,
payment, DigiD, or a confirmation page.

## Auto-fill safety

Reasonable to auto-fill only after explicit user opt-in and a live label/ID check:
initials, optional first name, optional name prefix, surname, street, house number,
optional addition, city, email, birth date, and mobile number. The profile file
must remain local and ignored if it contains real personal data.

Keep manual: slot choice, review of every personal detail, CAPTCHA, email or SMS
codes, DigiD, payment, consent controls, and every final confirmation or booking
action. This project must never automatically submit or confirm an appointment.
