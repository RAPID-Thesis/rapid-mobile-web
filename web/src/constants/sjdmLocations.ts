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

/** Approximate SJDM municipal bounds — excludes Caloocan / QC areas south of the city. */
export const SJDM_BOUNDS = {
  south: 14.748,
  north: 14.872,
  west: 120.992,
  east: 121.088,
} as const;

/**
 * Default map view when a district is selected without a specific barangay.
 *
 * Each centre is the middle of the district's barangays as geocoded in
 * ml/data/gis/barangay_centroids.json -- District 1 is Poblacion, Muzon,
 * Tungkong Mangga and the south; District 2 is the Sapang Palay barangays to
 * the north. These used to be hand-set and wrong: District 1 pointed at the
 * Sapang Palay area and District 2 at a spot south-west of both districts, so
 * the heatmap's district filter flew to the wrong place. Zoom 13 keeps the
 * whole district in view even at the map's 420 px minimum height.
 */
export const SJDM_DISTRICT_MAP_FOCUS: Record<
  SjdmDistrict,
  { center: [number, number]; zoom: number }
> = {
  'District 1': { center: [14.804, 121.055], zoom: 13 },
  'District 2': { center: [14.851, 121.061], zoom: 13 },
};

export function isWithinSjdm(lat: number, lng: number): boolean {
  return (
    lat >= SJDM_BOUNDS.south &&
    lat <= SJDM_BOUNDS.north &&
    lng >= SJDM_BOUNDS.west &&
    lng <= SJDM_BOUNDS.east
  );
}

export function getDistrictForBarangay(barangay: string): SjdmDistrict | null {
  for (const district of SJDM_DISTRICT_OPTIONS) {
    if ((SJDM_DISTRICTS[district] as readonly string[]).includes(barangay)) {
      return district;
    }
  }
  return null;
}
