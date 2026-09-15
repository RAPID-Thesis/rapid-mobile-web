export const SJDM_MUNICIPALITY = 'San Jose del Monte';

export const SJDM_DISTRICTS = {
  'District 1': [
    'Poblacion',
    'Poblacion 1',
    'Francisco Homes – Narra',
    'Francisco Homes – Mulawin',
    'Francisco Homes – Yakal',
    'Francisco Homes – Guijo',
    'Gumaok East',
    'Gumaok West',
    'Gumaok Central',
    'Graceville',
    'Gaya-gaya',
    'Sto. Cristo',
    'Tungkong Mangga',
    'Dulong Bayan',
    'Ciudad Real',
    'Maharlika',
    'San Manuel',
    'Kaypian',
    'San Isidro',
    'San Roque',
    'Kaybanban',
    'Paradise III',
    'Muzon Proper',
    'Muzon East',
    'Muzon West',
    'Muzon South',
  ],
  'District 2': [
    'Minuyan Proper',
    'Minuyan I',
    'Minuyan II',
    'Minuyan III',
    'Minuyan IV',
    'Minuyan V',
    'Bagong Buhay I',
    'Bagong Buhay II',
    'Bagong Buhay III',
    'San Martin I',
    'San Martin II',
    'San Martin III',
    'San Martin IV',
    'Sta. Cruz I',
    'Sta. Cruz II',
    'Sta. Cruz III',
    'Sta. Cruz IV',
    'Sta. Cruz V',
    'Fatima I',
    'Fatima II',
    'Fatima III',
    'Fatima IV',
    'Fatima V',
    'Citrus',
    'San Pedro',
    'Sapang Palay Proper',
    'San Martin De Porres',
    'Assumption',
    'Sto. Nino I',
    'Sto. Nino II',
    'Lawang Pare',
    'San Rafael I',
    'San Rafael II',
    'San Rafael III',
    'San Rafael IV',
    'San Rafael V',
  ],
} as const;

export type SjdmDistrict = keyof typeof SJDM_DISTRICTS;

export const SJDM_DISTRICT_OPTIONS: SjdmDistrict[] = ['District 1', 'District 2'];

export function getBarangaysForDistrict(district: SjdmDistrict): readonly string[] {
  return SJDM_DISTRICTS[district];
}

/**
 * Approximate SJDM municipal bounds — excludes the Caloocan / QC areas to the
 * south. Mirrors web/src/constants/sjdmLocations.ts.
 */
export const SJDM_BOUNDS = {
  south: 14.748,
  north: 14.872,
  west: 120.992,
  east: 121.088,
} as const;

export function isWithinSjdm(lat: number, lng: number): boolean {
  return (
    lat >= SJDM_BOUNDS.south &&
    lat <= SJDM_BOUNDS.north &&
    lng >= SJDM_BOUNDS.west &&
    lng <= SJDM_BOUNDS.east
  );
}

/**
 * The district a barangay belongs to, or null if the name is not one of ours.
 *
 * The wizard's barangay picker is filtered by district, so anything that sets a
 * barangay from outside that picker — a reverse-geocoded GPS fix, a tapped
 * address suggestion — has to set the district too or the picker will disagree
 * with the field beside it.
 */
export function getDistrictForBarangay(barangay: string): SjdmDistrict | null {
  const needle = barangay.trim().toLowerCase();
  for (const district of SJDM_DISTRICT_OPTIONS) {
    for (const name of SJDM_DISTRICTS[district] as readonly string[]) {
      if (name.toLowerCase() === needle) return district;
    }
  }
  return null;
}
