export type CarrierContact = {
  mc_num: string;
  legal_name: string;
  email: string;
  phone: string;
};

export const CARRIER_CONTACTS: readonly CarrierContact[] = [
  { mc_num: '76400',  legal_name: 'Hammer Lane Trucking LLC',          email: 'dispatch@hammerlane.example.com',          phone: '+14045551201' },
  { mc_num: '29910',  legal_name: 'ABF Freight System Inc',            email: 'ops@abffreight.example.com',               phone: '+15015550194' },
  { mc_num: '133655', legal_name: 'Schneider National Carriers Inc',   email: 'dispatch@schneidernational.example.com',   phone: '+19205550170' },
  { mc_num: '91045',  legal_name: 'Ravenna Transport LLC',             email: 'dispatch@ravennatransport.example.com',    phone: '+12165550111' },
  { mc_num: '66788',  legal_name: 'Cubeship Consolidation Company',    email: 'ops@cubeship.example.com',                 phone: '+14155550142' },
  { mc_num: '174579', legal_name: 'Vannoy Contractors Inc',            email: 'dispatch@vannoycontractors.example.com',   phone: '+13365550129' },
];

export const findCarrierByMc = (mc: string): CarrierContact | undefined =>
  CARRIER_CONTACTS.find((c) => c.mc_num === mc);
