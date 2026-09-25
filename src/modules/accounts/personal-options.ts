/* Option lists for the Personal Lines Applicant page (rating-style industry / occupation, education, license…). */

export const PREFIXES = ['MR', 'MRS', 'MS', 'MISS', 'DR', 'REV'];
export const SUFFIXES = ['JR', 'SR', 'II', 'III', 'IV', 'V'];
export const GENDERS = ['Male', 'Female', 'Non-binary', 'Not specified'];
export const MARITAL = ['Single', 'Married', 'Domestic Partner', 'Divorced', 'Separated', 'Widowed'];
export const DL_STATUSES = ['Valid', 'Permit', 'Expired', 'Suspended', 'Revoked', 'Foreign', 'Not Licensed'];
export const EDUCATION = [
  'No High School Diploma', 'High School Diploma', 'Some College', 'Vocational/Technical Degree', 'Associates', 'Bachelors', 'Masters', 'PhD',
  'Medical Degree', 'Law Degree',
];
export const LANGUAGES = ['English', 'Spanish', 'Chinese', 'Vietnamese', 'Tagalog', 'Korean', 'Arabic', 'French', 'German', 'Russian', 'Portuguese', 'Other'];
export const ADDRESS_TYPES_PL = ['Home', 'Mailing', 'Previous', 'Vacation / Seasonal', 'Rental Property', 'Garaging', 'Billing'];
export const PHONE_TYPES = ['Mobile', 'Home', 'Work', 'Other'];
export const EMAIL_TYPES = ['Primary', 'Secondary', 'Work'];
export const CONTACT_METHODS = ['Mobile Phone', 'Home Phone', 'Work Phone', 'Email', 'Text Message', 'Mail'];
export const CONTACT_TIMES = ['Anytime', 'Morning (8am–12pm)', 'Afternoon (12pm–5pm)', 'Evening (5pm–8pm)', 'Weekends'];

/** Applicant Type → the account status used for reporting. */
export const APPLICANT_TYPES: { label: string; status: 'Prospect' | 'Active' | 'Pending' | 'Inactive' }[] = [
  { label: 'Prospect/Lead', status: 'Prospect' },
  { label: 'Client', status: 'Active' },
  { label: 'Pending Client', status: 'Pending' },
  { label: 'Former Client', status: 'Inactive' },
];

/** Industry → occupations, in the style of personal auto rating questions. */
export const INDUSTRIES: Record<string, string[]> = {
  'Agriculture/Forestry/Fishing': ['Farm Owner', 'Farm Worker', 'Rancher', 'Fisherman', 'Forester', 'Landscaper/Groundskeeper', 'Other'],
  'Art/Design/Media': ['Artist', 'Designer', 'Photographer', 'Writer/Editor', 'Musician', 'Actor', 'Reporter/Journalist', 'Other'],
  'Banking/Finance/Real Estate': ['Accountant/Auditor', 'Banker', 'Financial Advisor', 'Loan Officer', 'Real Estate Agent/Broker', 'Teller', 'Other'],
  'Business/Sales/Office': ['Account Executive', 'Administrative Assistant', 'Business Owner', 'Customer Service Rep', 'Manager', 'Receptionist', 'Sales Representative', 'Other'],
  'Construction/Energy Trades': ['Carpenter', 'Electrician', 'Laborer', 'Plumber', 'Roofer', 'Contractor', 'Oil/Gas Worker', 'Other'],
  'Education/Library': ['Teacher', 'Professor', 'Principal/Administrator', 'Librarian', 'Teacher Aide', 'Counselor', 'Other'],
  'Engineer/Architect/Science/Math': ['Architect', 'Engineer', 'Scientist', 'Mathematician/Statistician', 'Lab Technician', 'Other'],
  'Food Service/Hotel Services': ['Chef/Cook', 'Server', 'Bartender', 'Restaurant Manager', 'Hotel Staff', 'Other'],
  'Government/Military': ['Federal Employee', 'State/Local Employee', 'Military Officer', 'Enlisted Military', 'Postal Worker', 'Other'],
  'Homemaker/Houseperson': ['Homemaker/Houseperson'],
  'Information Technology': ['Software Developer', 'Network/Systems Admin', 'IT Support', 'Data Analyst', 'IT Manager', 'Other'],
  Insurance: ['Agent/Broker', 'Claims Adjuster', 'Customer Service Rep', 'Underwriter', 'Other'],
  'Legal/Law Enforcement/Security': ['Attorney', 'Paralegal', 'Judge', 'Police Officer', 'Security Guard', 'Firefighter', 'Other'],
  'Maintenance/Repair/Housekeeping': ['Mechanic', 'Maintenance Worker', 'Housekeeper/Janitor', 'HVAC Technician', 'Other'],
  'Manufacturing/Production': ['Assembler', 'Machine Operator', 'Supervisor', 'Quality Control', 'Welder', 'Other'],
  'Medical/Social Services/Religion': ['Physician', 'Nurse', 'Dentist', 'Pharmacist', 'Medical Assistant', 'Social Worker', 'Clergy', 'Therapist', 'Other'],
  'Personal Care/Service': ['Hair Stylist/Barber', 'Childcare Worker', 'Fitness Trainer', 'Home Health Aide', 'Other'],
  Retired: ['Retired'],
  Student: ['Full-Time Student', 'Part-Time Student', 'Graduate Student'],
  'Travel/Transportation/Storage': ['Truck Driver', 'Delivery Driver', 'Pilot', 'Flight Attendant', 'Bus Driver', 'Warehouse Worker', 'Other'],
  Unemployed: ['Unemployed'],
  Disabled: ['Disabled'],
};

/** Occupations with no employment history questions. */
export const NO_YEARS_OCCUPATIONS = ['Homemaker/Houseperson', 'Retired', 'Unemployed', 'Disabled', 'Full-Time Student', 'Part-Time Student', 'Graduate Student'];
