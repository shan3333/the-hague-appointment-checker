export const APPOINTMENT_SERVICES = {
  brp_existing_bsn: {
    id: "brp_existing_bsn",
    productId: 35,
    name: "Register again in the BRP — already has BSN",
    bookingUrl: "https://denhaag.mijnafspraakmaken.nl/?product=35"
  },
  brp_dutch_first_registration: {
    id: "brp_dutch_first_registration",
    productId: 27,
    name: "First BRP registration — Dutch citizen",
    bookingUrl: "https://denhaag.mijnafspraakmaken.nl/?product=27"
  },
  brp_eu_eea_swiss_first_registration: {
    id: "brp_eu_eea_swiss_first_registration",
    productId: 28,
    name: "First BRP registration — EU/EEA or Swiss citizen",
    bookingUrl: "https://denhaag.mijnafspraakmaken.nl/?product=28"
  },
  brp_residence_permit_first_registration: {
    id: "brp_residence_permit_first_registration",
    productId: 30,
    name: "First BRP registration — residence permit holder",
    bookingUrl: "https://denhaag.mijnafspraakmaken.nl/?product=30"
  },
  brp_foreign_documents: {
    id: "brp_foreign_documents",
    productId: 15,
    name: "Register foreign documents in the BRP",
    bookingUrl: "https://denhaag.mijnafspraakmaken.nl/?product=15",
    multipleLocations: true
  }
} as const;

export type AppointmentServiceId = keyof typeof APPOINTMENT_SERVICES;
export type AppointmentService = (typeof APPOINTMENT_SERVICES)[AppointmentServiceId];

export function isAppointmentServiceId(value: string): value is AppointmentServiceId {
  return Object.hasOwn(APPOINTMENT_SERVICES, value);
}

export function getAppointmentService(id: string): AppointmentService {
  if (!isAppointmentServiceId(id)) throw new Error(`Unsupported appointment service "${id}"`);
  return APPOINTMENT_SERVICES[id];
}
