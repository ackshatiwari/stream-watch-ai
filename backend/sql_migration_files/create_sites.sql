create table sites (
  site_no            text primary key,              -- USGS site number, e.g. '01646500'
  agency_cd          text not null,                 -- e.g. 'USGS'
  site_name          text not null,                 -- e.g. 'Potomac River Near Little Falls'
  latitude           double precision,  
  longitude          double precision,
  drainage_area_sqmi double precision,
);
 