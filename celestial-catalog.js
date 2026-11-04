/* Shared, offline celestial catalog for Sky Tracker and Mahatat AlManzil.
 * Stars: approximate J2000 coordinates (RA in hours, Dec in degrees).
 * Asteroids: JPL SBDB-derived elements at 2026-06-09 (JD 2461200.5);
 * two-body Kepler approximation (NOT a precise telescope finder ephemeris).
 * Sources: https://ssd.jpl.nasa.gov/sb/orbits.html
 * https://spacecatalog.org/object/1-ceres through /4-vesta and /10-hygiea
 */
(function (root) {
  "use strict";
  const D=Math.PI/180, R=180/Math.PI, EPOCH=2461200.5;
  const stars=[
    ["Sirius","الشعرى اليمانية",6.75248,-16.7161,-1.46],
    ["Procyon","الشعرى الشامية",7.65503,5.2250,0.34],
    ["Canopus","سهيل",6.39919,-52.6957,-0.74],
    ["Arcturus","السماك الرامح",14.26102,19.1825,-0.05],
    ["Vega","النسر الواقع",18.61565,38.7837,0.03],
    ["Altair","النسر الطائر",19.84639,8.8683,0.77],
    ["Deneb","الذنب",20.69053,45.2803,1.25],
    ["Capella","العيوق",5.27816,45.9980,0.08],
    ["Rigel","رجل الجبار",5.24230,-8.2016,0.13],
    ["Betelgeuse","منكب الجوزاء",5.91953,7.4071,0.50],
    ["Aldebaran","الدبران",4.59868,16.5093,0.87],
    ["Antares","قلب العقرب",16.49013,-26.4320,1.06],
    ["Spica","السماك الأعزل",13.41988,-11.1614,0.98],
    ["Fomalhaut","فم الحوت",22.96085,-29.6222,1.16],
    ["Polaris","النجم القطبي",2.53030,89.2641,1.98],
    ["Regulus","قلب الأسد",10.13953,11.9672,1.35],
    ["Pollux","رأس التوأم المؤخر",7.75526,28.0262,1.14],
    ["Castor","رأس التوأم المقدم",7.57666,31.8883,1.58],
    ["Bellatrix","الناجذ",5.41885,6.3497,1.64],
    ["Dubhe","الدب الأكبر (الدبة)",11.06215,61.7508,1.79],
    ["Mizar","المئزر",13.39875,54.9254,2.23]
  ].map(function(x){return {id:x[0],name:x[1],ra:x[2],dec:x[3],mag:x[4],kind:"star"};});
  const asteroids=[
    ["Ceres","سيريس (1)",2.76555,.0796923,10.59,80.25,73.29,274.42],
    ["Pallas","بالاس (2)",2.769559,.2307,34.932793,172.886619,310.969916,254.25],
    ["Juno","جونو (3)",2.6709895,.2556999,12.98659,169.81163,247.89506,262.73228],
    ["Vesta","فيستا (4)",2.361366,.0902037,7.14393,103.70135,151.46856,81.19019],
    ["Hygiea","هيجيا (10)",3.15097,.106709,3.83,283.12,312.42,252.03]
  ].map(function(x){return {id:x[0],name:x[1],a:x[2],e:x[3],i:x[4],node:x[5],arg:x[6],M:x[7],kind:"asteroid"};});
  function wrap(x){return (x%360+360)%360;}
  function jd(date){return date.getTime()/86400000+2440587.5;}
  // Precess J2000 mean-equator star coordinates to mean equator of date.
  function precess(ra,dec,date){
    const t=(jd(date)-2451545)/36525;
    const zeta=(2306.2181*t+.30188*t*t+.017998*t*t*t)/3600*D;
    const z=(2306.2181*t+1.09468*t*t+.018203*t*t*t)/3600*D;
    const theta=(2004.3109*t-.42665*t*t-.041833*t*t*t)/3600*D;
    const a=ra*15*D, d=dec*D;
    const A=Math.cos(d)*Math.sin(a+zeta);
    const B=Math.cos(theta)*Math.cos(d)*Math.cos(a+zeta)-Math.sin(theta)*Math.sin(d);
    const C=Math.sin(theta)*Math.cos(d)*Math.cos(a+zeta)+Math.cos(theta)*Math.sin(d);
    return [wrap((Math.atan2(A,B)+z)*R), Math.asin(Math.max(-1,Math.min(1,C)))*R];
  }
  function horizontal(raDegrees,decDegrees,date,lat,lon){
    const j=jd(date), t=(j-2451545)/36525;
    const lst=wrap(280.46061837+360.98564736629*(j-2451545)+.000387933*t*t-t*t*t/38710000+lon);
    const H=wrap(lst-raDegrees)*D,phi=lat*D,dec=decDegrees*D;
    const alt=Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H))*R;
    const az=wrap(Math.atan2(-Math.cos(dec)*Math.sin(H),Math.cos(phi)*Math.sin(dec)-Math.sin(phi)*Math.cos(dec)*Math.cos(H))*R);
    return {az:az,alt:alt};
  }
  function starPosition(star,date,lat,lon){
    const p=precess(star.ra,star.dec,date);
    return Object.assign({id:star.id,name:star.name,kind:"star",mag:star.mag},horizontal(p[0],p[1],date,lat,lon));
  }
  function kepler(a,e,mean){
    const M=wrap(mean)*D;let E=M;
    for(let k=0;k<12;k++){const v=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));E-=v;if(Math.abs(v)<1e-12)break;}
    return [a*(Math.cos(E)-e),a*Math.sqrt(1-e*e)*Math.sin(E)];
  }
  function asteroidPosition(body,date,lat,lon){
    const j=jd(date),n=.9856076686/Math.pow(body.a,1.5);
    const xy=kepler(body.a,body.e,body.M+n*(j-EPOCH));
    const N=body.node*D,w=body.arg*D,i=body.i*D;
    const u=xy[0]*Math.cos(w)-xy[1]*Math.sin(w),v=xy[0]*Math.sin(w)+xy[1]*Math.cos(w);
    const x=Math.cos(N)*u-Math.sin(N)*v*Math.cos(i),y=Math.sin(N)*u+Math.cos(N)*v*Math.cos(i),z=v*Math.sin(i);
    // Approximate geocentric solar position (Schlyter solar elements), J2000 ecliptic.
    const d=j-2451543.5,em=.016709-1.151e-9*d;
    const xyS=kepler(1,em,356.0470+.9856002585*d);
    const sw=(282.9404+4.70935e-5*d)*D;
    const sx=xyS[0]*Math.cos(sw)-xyS[1]*Math.sin(sw),sy=xyS[0]*Math.sin(sw)+xyS[1]*Math.cos(sw);
    const ex=x+sx,ey=y+sy,ez=z,obl=23.439291111*D;
    const X=ex,Y=ey*Math.cos(obl)-ez*Math.sin(obl),Z=ey*Math.sin(obl)+ez*Math.cos(obl);
    const ra=wrap(Math.atan2(Y,X)*R),dec=Math.atan2(Z,Math.hypot(X,Y))*R;
    const pr=precess(ra/15,dec,date);
    const h=horizontal(pr[0],pr[1],date,lat,lon);
    return Object.assign({id:body.id,name:body.name,kind:"asteroid",approx:true,epoch:EPOCH},h);
  }
  root.CelestialCatalog={stars:stars,asteroids:asteroids,starPosition:starPosition,asteroidPosition:asteroidPosition,epoch:EPOCH};
})(typeof window!=="undefined"?window:globalThis);
