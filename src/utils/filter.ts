export const DEFAULT_FILTER = [
  false, //  - Include absent items in result;
  true, //  - Include registered items in result;
  true, //  - Include items with registration requests that are not disputed in result;
  true, //  - Include items with clearing requests that are not disputed in result;
  true, //  - Include disputed items with registration requests in result;
  true, //  - Include disputed items with clearing requests in result;
  true, //  - Include items with a request by _party;
  true, //  - Include items challenged by _party.
]
