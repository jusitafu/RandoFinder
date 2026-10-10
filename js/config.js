/**
 * Configuration Globale Centralisée - RandoFinder
 * Les Randonneurs Sanaryens - JLD Apps 2026
 * 
 * Identifiants Cloud Supabase intégrés par défaut
 * Prêt pour l'utilisation et le partage immédiat (Zero-configuration requise)
 */

window.APP_CONFIG = {
  // URL de l'instance Cloud Supabase du club
  supabaseUrl: 'https://qguseukrgsczgviuloxr.supabase.co',

  // Clé publique (Publishable Key) autorisée pour les navigateurs
  supabaseKey: 'sb_publishable_iy3fFv7Qo5Rc9D3gcNhXsA_72y1_j44',

  // Bucket de stockage public pour les fichiers GPX
  storageBucket: 'traces-gpx',

  // Nom de la table PostgreSQL
  tableName: 'randonnees',

  // Synchronisation automatique activée par défaut à l'ouverture
  autoSync: true
};
