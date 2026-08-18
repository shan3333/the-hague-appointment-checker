import { checkOnce } from "./checker.js";
import { getAppointmentService } from "./appointmentServices.js";

const service = getAppointmentService("brp_foreign_documents");
const result = await checkOnce({
  bookingUrl: service.bookingUrl,
  multipleLocations: "multipleLocations" in service && service.multipleLocations,
  keepBrowserOpenMs: 15_000
});

console.log(JSON.stringify({
  service: service.name,
  status: result.status,
  reason: result.reason,
  availability: result.availabilities ?? []
}, null, 2));

if (result.status === "PAGE_NOT_LOADED" || result.status === "ERROR") process.exitCode = 1;
