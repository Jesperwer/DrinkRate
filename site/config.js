// Supabase connection. The publishable/anon key is meant to be public;
// all access goes through the database functions in supabase/setup.sql.
window.DR_CONFIG = {
  url: "https://felmnkwhdigmdiywamui.supabase.co",
  key: "sb_publishable_dzPjy8_f2kDZG1XetlmSVw_HmlaY4eb",
  // The people shown on the login screen. New users are set up by Jesper
  // (registration is closed with supabase/security_holiday.sql).
  family: ["Luise", "Jesper", "Jakob", "Astri", "Ingvild", "Anne", "Julie"],
  // Switches for the holiday features. Missing = off. They only decide what the
  // site shows; they are not access control, and changing one needs a new push.
  features: { birthday: true, controversy: true, twins: true, quiz: true, tableGames: true, teamGame: true, blindRating: true, postcard: true, customDrinks: true },
  // Anne's birthday: the banner shows on this date in this time zone only.
  // The sticker id stays forever so earned stickers keep showing.
  birthday: { id: "anne2026", name: "Anne", date: "2026-10-13", tz: "Asia/Nicosia" },
};
