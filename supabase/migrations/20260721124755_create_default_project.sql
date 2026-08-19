/*
# Create default project and seed reference data

1. Creates a default "Malomatia HMC" project with the default form config
2. Seeds reference_options and glossary (re-applies from original seed, adapted for new project)
*/

-- Default project
INSERT INTO projects (name, description, form_config, active)
VALUES (
  'Malomatia HMC',
  'Default Malomatia HMC call evaluation project',
  '{"categories":[{"key":"Softskills","label":"Softskills","critical":false,"items":[{"id":"call_opening_closure","label":"Call Opening / Closure"},{"id":"choice_of_words","label":"Choice of words / Avoid Slang / Technical Terms / Customer name"},{"id":"tone_of_voice","label":"Tone of voice"},{"id":"showing_empathy","label":"Showing Empathy / Handling objection / Interrupting the Customer"},{"id":"active_listening","label":"Active listening / Interrupting"},{"id":"hold","label":"Hold"}]},{"key":"Customer Critical","label":"Customer Critical","critical":true,"items":[{"id":"ticket_escalation_status","label":"Ticket Escalation and Status"},{"id":"customer_profile","label":"Customer Profile / required data"},{"id":"transfer_process","label":"Transfer Process"},{"id":"correct_info","label":"Correct information provided (Knowledge)"},{"id":"missing_info","label":"Missing Information (Knowledge)"},{"id":"ticket_description","label":"Ticket description"},{"id":"professionalism","label":"Professionalism / Attitude"}]},{"key":"Business Critical","label":"Business Critical","critical":true,"items":[{"id":"ticket_type_categorization","label":"Ticket Type and Categorization"},{"id":"control_call","label":"Control the call / Comprehension"},{"id":"ticketing_tree","label":"Ticketing tree"}]},{"key":"Compliance Critical","label":"Compliance Critical","critical":true,"items":[{"id":"compliance","label":"Compliance (Verification, Policy)"}]}],"scoring":{"basePass":100,"baseFail":30,"softskillPenalty":5,"softskillFailThreshold":4}}'::jsonb,
  true
)
ON CONFLICT (name) DO NOTHING;

-- Assign all existing agents to the default project
UPDATE agents SET project_id = (SELECT id FROM projects WHERE name = 'Malomatia HMC')
WHERE project_id IS NULL;
