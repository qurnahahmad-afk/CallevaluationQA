/*
# Fix admin password hash

The previous bootstrap used crypt() with cost factor 6 ($2a$06$).
Supabase GoTrue expects bcrypt cost 10 ($2a$10$).
This updates the encrypted_password to use the correct format.
*/

UPDATE auth.users
SET encrypted_password = crypt('Admin@2024!', gen_salt('bf', 10)),
    updated_at = now()
WHERE email = 'ahmad.qurnah@crystel.co';
