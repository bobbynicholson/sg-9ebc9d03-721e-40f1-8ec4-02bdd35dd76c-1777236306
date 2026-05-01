-- Two extra deductibility rules so the slip scanner can deterministically
-- tag pet food + tobacco lines instead of relying on the AI's reasoning
-- (which was the fallback for slips like the Spar one with cat food and
-- Rothmans on the same till slip as catering ingredients).

INSERT INTO public.sa_tax_deductibility_rules
  (category_code, display_name, group_label, deductibility, vat_input_claimable, treatment, capital_threshold_rand, match_keywords, example_items, legal_reference, notes, display_order)
VALUES
  ('pet_food', 'Pet food (personal)', 'Non-deductible', 'non_deductible', 'not_claimable', 'non_allowed', NULL,
    ARRAY['cat food','catfood','dog food','dogfood','pet food','petfood','friskies','whiskas','purr','k9','iams','royal canin','hills','science diet','dog biscuits','cat biscuits','cat litter','dog treats','cat treats','pedigree','optimum','montego','bobtail','epol','ultra dog','ultra cat','feliway','catit','rabbit food','bird seed','fish food','aquarium'],
    ARRAY['Friskies F/Cuts','Spar Catfood Tun','K9 Poultry','Whiskas Pouch','Royal Canin'],
    'ITA s23(g)', 'Pet food for personal pets is not in production of income. Working dogs (e.g. guard dog at a business premises) may qualify under s11(a) but require apportionment and clear business purpose.', 106),
  ('tobacco_personal', 'Tobacco / cigarettes (personal)', 'Non-deductible', 'non_deductible', 'not_claimable', 'non_allowed', NULL,
    ARRAY['rothmans','peter stuyvesant','stuyvesant','marlboro','dunhill','camel','pall mall','lucky strike','benson','hedges','cigarettes','cigarette','tobacco','snuff','cigars','cigar','vape','e-cigarette','nicotine','rolling tobacco','rizla'],
    ARRAY['Rothmans Special F20','Peter Stuyvesant','Marlboro Gold'],
    'ITA s23(g)', 'Personal consumption -- not in production of income, regardless of whether the buyer is the owner or a staff member.', 107)
ON CONFLICT (category_code) DO NOTHING;
