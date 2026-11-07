export interface RegionChile {
  region: string;
  comunas: string[];
}

export const REGIONES_Y_COMUNAS_CHILE: RegionChile[] = [
  {
    region: "Región Metropolitana",
    comunas: [
      "Santiago", "Cerrillos", "Cerro Navia", "Conchalí", "El Bosque", "Estación Central",
      "Huechuraba", "Independencia", "La Cisterna", "La Florida", "La Granja", "La Pintana",
      "La Reina", "Las Condes", "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipú",
      "Ñuñoa", "Pedro Aguirre Cerda", "Peñalolén", "Providencia", "Pudahuel", "Quilicura",
      "Quinta Normal", "Recoleta", "Renca", "San Joaquín", "San Miguel", "San Ramón",
      "Vitacura", "Puente Alto", "Pirque", "San José de Maipo", "Colina", "Lampa",
      "Tiltil", "San Bernardo", "Buin", "Calera de Tango", "Paine", "Melipilla",
      "Alhué", "Curacaví", "María Pinto", "San Pedro", "Talagante", "El Monte",
      "Isla de Maipo", "Padre Hurtado", "Peñaflor"
    ]
  },
  {
    region: "Valparaíso",
    comunas: [
      "Valparaíso", "Viña del Mar", "Concón", "Quilpué", "Villa Alemana", "Quillota",
      "La Calera", "Limache", "San Antonio", "Cartagena", "Santo Domingo", "El Quisco",
      "Algarrobo", "Los Andes", "San Felipe", "Casablanca"
    ]
  },
  {
    region: "Biobío",
    comunas: [
      "Concepción", "Talcahuano", "San Pedro de la Paz", "Chiguayante", "Coronel",
      "Hualpén", "Los Ángeles", "Tomé", "Penco", "Lota", "Arauco", "Curanilahue"
    ]
  },
  {
    region: "Coquimbo",
    comunas: ["La Serena", "Coquimbo", "Ovalle", "Illapel", "Vicuña", "Salamanca"]
  },
  {
    region: "Antofagasta",
    comunas: ["Antofagasta", "Calama", "Tocopilla", "Mejillones", "San Pedro de Atacama"]
  },
  {
    region: "Araucanía",
    comunas: ["Temuco", "Padre Las Casas", "Villarrica", "Pucón", "Angol", "Lautaro", "Victoria"]
  },
  {
    region: "O'Higgins",
    comunas: ["Rancagua", "Machalí", "Rengo", "San Fernando", "Santa Cruz", "Graneros"]
  },
  {
    region: "Maule",
    comunas: ["Talca", "Curicó", "Linares", "Constitución", "Molina", "San Javier", "Parral"]
  },
  {
    region: "Los Lagos",
    comunas: ["Puerto Montt", "Puerto Varas", "Osorno", "Castro", "Ancud", "Frutillar"]
  },
  {
    region: "Tarapacá",
    comunas: ["Iquique", "Alto Hospicio", "Pozo Almonte"]
  },
  {
    region: "Arica y Parinacota",
    comunas: ["Arica", "Camarones", "Putre"]
  },
  {
    region: "Ñuble",
    comunas: ["Chillán", "Chillán Viejo", "San Carlos", "Bulnes", "Yungay"]
  },
  {
    region: "Los Ríos",
    comunas: ["Valdivia", "La Unión", "Panguipulli", "Río Bueno"]
  },
  {
    region: "Magallanes",
    comunas: ["Punta Arenas", "Puerto Natales", "Porvenir"]
  },
  {
    region: "Atacama",
    comunas: ["Copiapó", "Vallenar", "Caldera", "Chañaral"]
  },
  {
    region: "Aysén",
    comunas: ["Coyhaique", "Aysén", "Chile Chico"]
  }
];

export const TODAS_LAS_COMUNAS_CHILE: string[] = REGIONES_Y_COMUNAS_CHILE.flatMap(r => r.comunas).sort((a, b) => a.localeCompare(b));
