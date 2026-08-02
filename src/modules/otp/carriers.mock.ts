export type CarrierContact = {
  mc_num: string;
  legal_name: string;
  email: string;
  phone: string;
};

export const CARRIER_CONTACTS: readonly CarrierContact[] = [
  { mc_num: '872144', legal_name: 'Southern Freight Co.',    email: 'dispatch@southernfreight.example.com',    phone: '+14045551201' },
  { mc_num: '445912', legal_name: 'Prairie Logistics LLC',   email: 'ops@prairielogistics.example.com',         phone: '+13125550194' },
  { mc_num: '110338', legal_name: 'Gulf Coast Trucking',     email: 'carrier@gulfcoasttrucking.example.com',    phone: '+17135550170' },
  { mc_num: '620017', legal_name: 'Pacific Line Carriers',   email: 'dispatch@pacificline.example.com',         phone: '+12135550111' },
  { mc_num: '389205', legal_name: 'Northeast Haulers Inc.',  email: 'ops@northeasthaulers.example.com',         phone: '+16175550142' },
  { mc_num: '502388', legal_name: 'Rocky Mountain Freight',  email: 'dispatch@rockymtn.example.com',            phone: '+13035550129' },
  { mc_num: '714006', legal_name: 'Sunbelt Cartage',         email: 'ops@sunbeltcartage.example.com',           phone: '+16025550188' },
];

export const findCarrierByMc = (mc: string): CarrierContact | undefined =>
  CARRIER_CONTACTS.find((c) => c.mc_num === mc);
