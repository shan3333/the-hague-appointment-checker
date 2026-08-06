/**
 * Personal details accepted by the observed The Hague booking form.
 * Dates use the provider's displayed DD-MM-YYYY format.
 */
export interface BookingProfile {
  initials: string;
  firstName?: string;
  namePrefix?: string;
  lastName: string;
  street: string;
  houseNumber: string;
  houseNumberAddition?: string;
  city: string;
  email: string;
  birthDate: string;
  mobilePhone: string;
}
