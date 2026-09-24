/*
 * Business classification lookup for commercial applicants.
 * A built-in reference list of common small-commercial classes (2022 NAICS titles) with the closest 1987 SIC code.
 * "Nature of Business" uses the ACORD 125 categories, derived from the NAICS sector.
 * This stands in for a live classification service; verify unusual risks against the official NAICS manual.
 */

export type NaicsClass = { naics: string; title: string; sic: string; keywords?: string };

export const NAICS_CLASSES: NaicsClass[] = [
  // Construction
  { naics: '236115', title: 'New Single-Family Housing Construction (except For-Sale Builders)', sic: '1521', keywords: 'home builder general contractor' },
  { naics: '236118', title: 'Residential Remodelers', sic: '1521', keywords: 'remodeling renovation kitchen bath handyman' },
  { naics: '236220', title: 'Commercial and Institutional Building Construction', sic: '1542', keywords: 'general contractor commercial builder' },
  { naics: '238110', title: 'Poured Concrete Foundation and Structure Contractors', sic: '1771', keywords: 'concrete foundation flatwork' },
  { naics: '238130', title: 'Framing Contractors', sic: '1751', keywords: 'framer carpentry' },
  { naics: '238140', title: 'Masonry Contractors', sic: '1741', keywords: 'mason brick stone block' },
  { naics: '238150', title: 'Glass and Glazing Contractors', sic: '1793', keywords: 'glass windows glazing' },
  { naics: '238160', title: 'Roofing Contractors', sic: '1761', keywords: 'roofer roof shingles' },
  { naics: '238170', title: 'Siding Contractors', sic: '1761', keywords: 'siding gutters' },
  { naics: '238210', title: 'Electrical Contractors and Other Wiring Installation Contractors', sic: '1731', keywords: 'electrician electrical wiring' },
  { naics: '238220', title: 'Plumbing, Heating, and Air-Conditioning Contractors', sic: '1711', keywords: 'plumber hvac heating air conditioning' },
  { naics: '238290', title: 'Other Building Equipment Contractors', sic: '1796', keywords: 'elevator equipment installation' },
  { naics: '238310', title: 'Drywall and Insulation Contractors', sic: '1742', keywords: 'drywall insulation sheetrock' },
  { naics: '238320', title: 'Painting and Wall Covering Contractors', sic: '1721', keywords: 'painter painting wallpaper' },
  { naics: '238330', title: 'Flooring Contractors', sic: '1752', keywords: 'flooring carpet hardwood' },
  { naics: '238340', title: 'Tile and Terrazzo Contractors', sic: '1743', keywords: 'tile terrazzo' },
  { naics: '238350', title: 'Finish Carpentry Contractors', sic: '1751', keywords: 'carpenter cabinets trim' },
  { naics: '238910', title: 'Site Preparation Contractors', sic: '1794', keywords: 'excavation grading demolition' },
  { naics: '238990', title: 'All Other Specialty Trade Contractors', sic: '1799', keywords: 'fencing paving specialty' },
  // Services to buildings
  { naics: '561710', title: 'Exterminating and Pest Control Services', sic: '7342', keywords: 'pest control exterminator' },
  { naics: '561720', title: 'Janitorial Services', sic: '7349', keywords: 'janitorial cleaning commercial cleaning' },
  { naics: '561730', title: 'Landscaping Services', sic: '0782', keywords: 'landscaping lawn care mowing tree' },
  { naics: '561612', title: 'Security Guards and Patrol Services', sic: '7381', keywords: 'security guard patrol' },
  { naics: '561311', title: 'Employment Placement Agencies', sic: '7361', keywords: 'staffing recruiting employment' },
  // Food service & lodging
  { naics: '722511', title: 'Full-Service Restaurants', sic: '5812', keywords: 'restaurant dining' },
  { naics: '722513', title: 'Limited-Service Restaurants', sic: '5812', keywords: 'fast food pizza takeout' },
  { naics: '722515', title: 'Snack and Nonalcoholic Beverage Bars', sic: '5812', keywords: 'coffee shop cafe juice bakery cafe' },
  { naics: '722410', title: 'Drinking Places (Alcoholic Beverages)', sic: '5813', keywords: 'bar tavern pub' },
  { naics: '722320', title: 'Caterers', sic: '5812', keywords: 'catering caterer events' },
  { naics: '721110', title: 'Hotels (except Casino Hotels) and Motels', sic: '7011', keywords: 'hotel motel lodging' },
  { naics: '721191', title: 'Bed-and-Breakfast Inns', sic: '7011', keywords: 'bed and breakfast inn' },
  // Retail
  { naics: '311811', title: 'Retail Bakeries', sic: '5461', keywords: 'bakery baked goods' },
  { naics: '445110', title: 'Supermarkets and Other Grocery Retailers (except Convenience Retailers)', sic: '5411', keywords: 'grocery supermarket' },
  { naics: '445131', title: 'Convenience Retailers', sic: '5411', keywords: 'convenience store' },
  { naics: '445320', title: 'Beer, Wine, and Liquor Retailers', sic: '5921', keywords: 'liquor store wine' },
  { naics: '444110', title: 'Home Centers', sic: '5211', keywords: 'home improvement lumber' },
  { naics: '444140', title: 'Hardware Retailers', sic: '5251', keywords: 'hardware store' },
  { naics: '449110', title: 'Furniture Retailers', sic: '5712', keywords: 'furniture store' },
  { naics: '456110', title: 'Pharmacies and Drug Retailers', sic: '5912', keywords: 'pharmacy drugstore' },
  { naics: '458110', title: 'Clothing and Clothing Accessories Retailers', sic: '5651', keywords: 'clothing boutique apparel' },
  { naics: '459110', title: 'Sporting Goods Retailers', sic: '5941', keywords: 'sporting goods' },
  { naics: '459310', title: 'Florists', sic: '5992', keywords: 'florist flowers' },
  { naics: '459910', title: 'Pet and Pet Supplies Retailers', sic: '5999', keywords: 'pet store pet supplies' },
  { naics: '441110', title: 'New Car Dealers', sic: '5511', keywords: 'auto dealer car dealership' },
  { naics: '441120', title: 'Used Car Dealers', sic: '5521', keywords: 'used cars' },
  { naics: '441330', title: 'Automotive Parts and Accessories Retailers', sic: '5531', keywords: 'auto parts' },
  { naics: '457110', title: 'Gasoline Stations with Convenience Stores', sic: '5541', keywords: 'gas station fuel' },
  // Auto & repair services
  { naics: '811111', title: 'General Automotive Repair', sic: '7538', keywords: 'auto repair mechanic garage' },
  { naics: '811121', title: 'Automotive Body, Paint, and Interior Repair and Maintenance', sic: '7532', keywords: 'body shop collision paint' },
  { naics: '811192', title: 'Car Washes', sic: '7542', keywords: 'car wash detailing' },
  { naics: '488410', title: 'Motor Vehicle Towing', sic: '7549', keywords: 'towing tow truck wrecker' },
  { naics: '811310', title: 'Commercial and Industrial Machinery and Equipment (except Automotive and Electronic) Repair and Maintenance', sic: '7699', keywords: 'equipment repair machinery' },
  { naics: '811412', title: 'Appliance Repair and Maintenance', sic: '7623', keywords: 'appliance repair' },
  // Transportation & warehousing
  { naics: '484110', title: 'General Freight Trucking, Local', sic: '4212', keywords: 'trucking local freight hauling' },
  { naics: '484121', title: 'General Freight Trucking, Long-Distance, Truckload', sic: '4213', keywords: 'long haul trucking truckload' },
  { naics: '492210', title: 'Local Messengers and Local Delivery', sic: '4215', keywords: 'courier delivery messenger' },
  { naics: '485310', title: 'Taxi and Ridesharing Services', sic: '4121', keywords: 'taxi rideshare limo' },
  { naics: '493110', title: 'General Warehousing and Storage', sic: '4225', keywords: 'warehouse storage logistics' },
  { naics: '562111', title: 'Solid Waste Collection', sic: '4212', keywords: 'trash waste hauling junk removal' },
  // Health care
  { naics: '621111', title: 'Offices of Physicians (except Mental Health Specialists)', sic: '8011', keywords: 'doctor physician clinic medical' },
  { naics: '621210', title: 'Offices of Dentists', sic: '8021', keywords: 'dentist dental' },
  { naics: '621310', title: 'Offices of Chiropractors', sic: '8041', keywords: 'chiropractor' },
  { naics: '621320', title: 'Offices of Optometrists', sic: '8042', keywords: 'optometrist eye care' },
  { naics: '621610', title: 'Home Health Care Services', sic: '8082', keywords: 'home health care nursing' },
  { naics: '623110', title: 'Nursing Care Facilities (Skilled Nursing Facilities)', sic: '8051', keywords: 'nursing home skilled nursing' },
  { naics: '541940', title: 'Veterinary Services', sic: '0742', keywords: 'veterinarian vet animal hospital' },
  // Personal services
  { naics: '812111', title: 'Barber Shops', sic: '7241', keywords: 'barber' },
  { naics: '812112', title: 'Beauty Salons', sic: '7231', keywords: 'salon hair beauty' },
  { naics: '812113', title: 'Nail Salons', sic: '7231', keywords: 'nail salon manicure' },
  { naics: '812310', title: 'Coin-Operated Laundries and Drycleaners', sic: '7215', keywords: 'laundromat' },
  { naics: '812320', title: 'Drycleaning and Laundry Services (except Coin-Operated)', sic: '7216', keywords: 'dry cleaner laundry' },
  { naics: '812910', title: 'Pet Care (except Veterinary) Services', sic: '0752', keywords: 'pet grooming boarding kennel dog' },
  { naics: '812210', title: 'Funeral Homes and Funeral Services', sic: '7261', keywords: 'funeral home' },
  { naics: '713940', title: 'Fitness and Recreational Sports Centers', sic: '7991', keywords: 'gym fitness yoga' },
  { naics: '611620', title: 'Sports and Recreation Instruction', sic: '7999', keywords: 'martial arts dance instruction' },
  { naics: '624410', title: 'Child Care Services', sic: '8351', keywords: 'daycare child care preschool' },
  { naics: '611110', title: 'Elementary and Secondary Schools', sic: '8211', keywords: 'school private school' },
  { naics: '813110', title: 'Religious Organizations', sic: '8661', keywords: 'church religious' },
  // Professional & financial
  { naics: '524210', title: 'Insurance Agencies and Brokerages', sic: '6411', keywords: 'insurance agency broker' },
  { naics: '522110', title: 'Commercial Banking', sic: '6021', keywords: 'bank' },
  { naics: '541110', title: 'Offices of Lawyers', sic: '8111', keywords: 'law firm attorney lawyer' },
  { naics: '541211', title: 'Offices of Certified Public Accountants', sic: '8721', keywords: 'cpa accountant accounting' },
  { naics: '541213', title: 'Tax Preparation Services', sic: '7291', keywords: 'tax preparation' },
  { naics: '541310', title: 'Architectural Services', sic: '8712', keywords: 'architect' },
  { naics: '541330', title: 'Engineering Services', sic: '8711', keywords: 'engineer engineering' },
  { naics: '541350', title: 'Building Inspection Services', sic: '7389', keywords: 'home inspector inspection' },
  { naics: '541511', title: 'Custom Computer Programming Services', sic: '7371', keywords: 'software developer programming' },
  { naics: '541512', title: 'Computer Systems Design Services', sic: '7373', keywords: 'it services computer consulting' },
  { naics: '541611', title: 'Administrative Management and General Management Consulting Services', sic: '8742', keywords: 'consultant consulting' },
  { naics: '541810', title: 'Advertising Agencies', sic: '7311', keywords: 'advertising marketing agency' },
  { naics: '541921', title: 'Photography Studios, Portrait', sic: '7221', keywords: 'photographer photography' },
  // Real estate
  { naics: '531110', title: 'Lessors of Residential Buildings and Dwellings', sic: '6513', keywords: 'apartment landlord rental property' },
  { naics: '531120', title: 'Lessors of Nonresidential Buildings (except Miniwarehouses)', sic: '6512', keywords: 'commercial landlord office building' },
  { naics: '531130', title: 'Lessors of Miniwarehouses and Self-Storage Units', sic: '4225', keywords: 'self storage' },
  { naics: '531210', title: 'Offices of Real Estate Agents and Brokers', sic: '6531', keywords: 'realtor real estate agent' },
  { naics: '531311', title: 'Residential Property Managers', sic: '6531', keywords: 'property management' },
  // Manufacturing & wholesale
  { naics: '312120', title: 'Breweries', sic: '2082', keywords: 'brewery craft beer' },
  { naics: '312130', title: 'Wineries', sic: '2084', keywords: 'winery vineyard' },
  { naics: '323111', title: 'Commercial Printing (except Screen and Books)', sic: '2752', keywords: 'print shop printing' },
  { naics: '332710', title: 'Machine Shops', sic: '3599', keywords: 'machine shop cnc fabrication' },
  { naics: '337110', title: 'Wood Kitchen Cabinet and Countertop Manufacturing', sic: '2434', keywords: 'cabinet maker countertops' },
  { naics: '424410', title: 'General Line Grocery Merchant Wholesalers', sic: '5141', keywords: 'food distributor wholesale grocery' },
  // Agriculture
  { naics: '111421', title: 'Nursery and Tree Production', sic: '0181', keywords: 'nursery greenhouse plants' },
  { naics: '112111', title: 'Beef Cattle Ranching and Farming', sic: '0212', keywords: 'ranch cattle farm' },
];

/** ACORD 125 "Nature of Business" category for a NAICS code. */
export function natureOfBusiness(naics: string): string {
  if (naics === '531110' || naics === '531311') return 'Apartments';
  const s2 = naics.slice(0, 2), s3 = naics.slice(0, 3);
  if (s2 === '23') return 'Contractor';
  if (s3 === '722') return 'Restaurant';
  if (s2 === '31' || s2 === '32' || s2 === '33') return 'Manufacturing';
  if (s2 === '42') return 'Wholesale';
  if (s2 === '44' || s2 === '45') return 'Retail';
  if (s2 === '61' || s3 === '623' || s3 === '813') return 'Institutional';
  if (s2 === '52' || s2 === '54' || s3 === '531' || s3 === '621') return 'Office';
  return 'Service';
}

/** Search by code, title or keyword; every word must match. */
export function searchNaics(term: string, limit = 8): NaicsClass[] {
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return NAICS_CLASSES
    .map((c) => {
      const hay = `${c.naics} ${c.sic} ${c.title} ${c.keywords ?? ''}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      const score = (c.naics.startsWith(words[0]) ? 3 : 0) + (c.title.toLowerCase().includes(words.join(' ')) ? 2 : 0);
      return { c, score };
    })
    .filter((x): x is { c: NaicsClass; score: number } => !!x)
    .sort((a, b) => b.score - a.score || a.c.title.localeCompare(b.c.title))
    .slice(0, limit)
    .map((x) => x.c);
}
