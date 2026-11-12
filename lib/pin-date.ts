// "YYYY-MM-DD" from <input type="date"> means "until the end of that day" in Poland.
// ponytail: fixed +01:00 (CET); during CEST the pin ends an hour later, harmless.
export const endOfPinDay = (date: string | undefined): Date | null =>
  date ? new Date(`${date}T23:59:59+01:00`) : null;
