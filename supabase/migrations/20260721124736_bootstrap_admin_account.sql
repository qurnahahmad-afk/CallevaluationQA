/*
# Bootstrap admin account

Creates the auth user for ahmad.qurnah@crystel.co with admin role.
1. Creates auth.users entry with encrypted password
2. Creates profiles entry with role='admin'
*/

-- Insert into auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_sso_user
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'ahmad.qurnah@crystel.co',
  crypt('Admin@2024!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  false
)
ON CONFLICT DO NOTHING;

-- Create the profile (upsert by email lookup)
INSERT INTO profiles (id, email, full_name, role, active)
SELECT id, email, 'Ahmad Qurnah', 'admin', true
FROM auth.users
WHERE email = 'ahmad.qurnah@crystel.co'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  active = true,
  full_name = 'Ahmad Qurnah';
