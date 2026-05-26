-- Pakistan 2026 public/religious holidays + default shifts for default company

DO $$
DECLARE
  v_company uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.holidays (company_id, name, holiday_date, holiday_type, description, is_paid)
  VALUES
    (v_company, 'Kashmir Solidarity Day', '2026-02-05', 'Public', 'Pakistan observance', true),
    (v_company, 'Eid ul-Fitr (Day 1)', '2026-03-21', 'Religious', 'Update dates yearly per moon sighting', true),
    (v_company, 'Eid ul-Fitr (Day 2)', '2026-03-22', 'Religious', NULL, true),
    (v_company, 'Eid ul-Fitr (Day 3)', '2026-03-23', 'Religious', NULL, true),
    (v_company, 'Pakistan Day', '2026-03-23', 'Public', '23 March', true),
    (v_company, 'Labour Day', '2026-05-01', 'Public', '1 May', true),
    (v_company, 'Eid ul-Adha (Day 1)', '2026-05-27', 'Religious', 'Update dates yearly', true),
    (v_company, 'Eid ul-Adha (Day 2)', '2026-05-28', 'Religious', NULL, true),
    (v_company, 'Eid ul-Adha (Day 3)', '2026-05-29', 'Religious', NULL, true),
    (v_company, 'Ashura', '2026-06-26', 'Religious', '9th and 10th Muharram - verify annually', true),
    (v_company, 'Independence Day', '2026-08-14', 'Public', '14 August', true),
    (v_company, 'Iqbal Day', '2026-11-09', 'Public', '9 November', true),
    (v_company, 'Quaid-e-Azam Day', '2026-12-25', 'Public', '25 December', true)
  ON CONFLICT (company_id, holiday_date, name) DO NOTHING;

  INSERT INTO public.shifts (company_id, code, name, start_time, end_time, break_minutes, grace_late_minutes, grace_early_minutes, is_night)
  VALUES
    (v_company, 'GEN', 'General Office (9–6)', '09:00', '18:00', 60, 15, 15, false),
    (v_company, 'FACT', 'Factory (8–5)', '08:00', '17:00', 60, 10, 15, false),
    (v_company, 'NIGHT', 'Night Shift', '22:00', '06:00', 30, 10, 15, true)
  ON CONFLICT (company_id, code) DO NOTHING;
END $$;
