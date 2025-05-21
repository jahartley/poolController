/*
HOCL as ppm CL2

inputs:
ph
total alkalinity ppm CaCO3
free chlorine ppm Cl2
cyanuric acid ppm CYA
calcium Hardness ppm CaCO3
TDS ppm (salt)
US Gal of water
Temperature tempF

outputs:
total Chloride ppm NaCl
carbonate alkalinity ppm CaCO3
LSI
%HOCl vs total Free chlorine
OCl- ppm
HOCl ppm
CSL
CSI
CCPP

working backwards from HOCl:				B224,B225,B226,B230 = true
[B20] B326*Cl2_g_mole*1000 
		//B326(species moles/L HOCl) Cl2_g_mole = 70.906
[B326] if B299 <> 0 then AT326+AT540 else B$298/(1+10^(pHinit-HOCl_pKa_Init)) 
		//B299(species moles/L CYA) pHinit = 8.2 HOClpkainit = 7.363
[AT326] IF(AND(AT$299<>0,IF(ISLOGICAL($B$226),$B$226,TRUE)) then IF(AQ$326+AQ$540<0.1*AQ$326,0.1*AQ$326,AQ$326+AQ$540) else AT$298/(1+10^(pHinit-AT$277)))
		//iterated 11 times... starts with P326

[P326] B298/(1+10^(phInit-HOCl_pKa)) //pHInit = ph input HOCl_pKa = HOCl equilibrium constant from B277

[B298] (FCinput(ppmCl2)/1000)/Cl2_g_mole

[B277] -LOG10((10^-(B$259*(17.35/B$260-(-86.11)))/(B$252)))

*/

constants = {};
constants.g_oz = 28.3495231; //B162
constants.oz_lb = 16; //B163
constants.mL_floz = 29.5735296; //B164
constants.floz_cup = 8; //B165
constants.CaCO3_g_mol = 100.0892; //B166
constants.HOCl_g_mol = 52.4603; //b167
constants.CYA_g_mol = 129.075; //b168
constants.CYA_g_mL = 0.92; //b169
constants.SO42_g_mol = 96.0631; //b170
constants.MuriaticAcidHCl_g_mol = 36.46; //b171
constants.MuriaticAcidHCl_percent = 31.45; //b172
constants.MuriaticAcidHCl_g_mL = 1.16; //b173
constants.SodiumBisulfateNaHSO4_g_mol = 120.0553; //b174
constants.SodiumBisulfateNaHSO4_percent = 93.2; //b175
constants.SodiumBisulfateNaHSO4_g_mL = 1.44; //b176
constants.SulfuricAcidH2SO4_g_mol = 98.08; //b177
constants.SulfuricAcidH2SO4_percent = 38.5; //b178
constants.SulfuricAcidH2SO4_g_mL = 1.25; //b179
constants.SodaAshNa2CO3_g_mol = 105.9888; //b180
constants.SodaAshNa2CO3_g_mL = 1.1; //b181
constants.CausticSodaNaOH_g_mol = 40; //b182
constants.CausticSodaNaOH_percent = 97.5; //b183
constants.CausticSodaNaOH_g_mL = 1; //b184
constants.SodiumBicarbNaHCO3_g_mol = 84.0069; //b185
constants.SodiumBicarbNaHCO3_g_mL = 1.2; //b186
constants.H2CO3_g_mol = 62.0251; //b187
constants.NaOCl_g_mol = 74.4422; //b188
constants.SodiumHypochloriteNaOCl_percent =	8.25; //b189
constants.NaOCl_g_mL = 1.10; //b190
constants.SodiumHypochlorite_pH = 11.90; //b191
constants.NaOCl_extra_base_mol_floz = 4.4544e-04; //b192
constants.CaOCl2_g_mol = 142.98366; //b193
constants.CalciumHypochloriteCaOCl2_percent = 65.0; //b194
constants.CaOCl2_g_mL = 1.025; //b195
constants.CaOCl2_oz_tablet = 0.247; //b196
constants.CalciumHypochlorite_pH = 10.7; //b197
constants.CaOCl2_extra_base_mol_oz = 1.6800e-02; //b198
constants.Trichlor_g_mol = 232.4103; //b199
constants.Trichlor_oz_tablet = 8; //b200
constants.Dichlor_2H2O_g_mol = 255.97766; //b201
constants.ChlorineGasCl2_g_mole = 70.906; //b202
constants.NonChlorineShock_g_mol = 614.77; //b203
constants.NonChlorineShock_g_mL = 1.3; //b204
constants.NonChlorineShock_pH = 2.3; //b205
constants.Shock_extra_base_mol_oz = 1.7534e-02; //b206
constants.CalciumChlorideCaCl2_pH = 10; //b207
constants.CaCl2_extra_base_mol_oz = 7.6888e-04; //b208
constants.CalciumChlorideCaCl2_g_mol = 110.9848; //b209
constants.CalciumChlorideCaCl2_g_mL = 1.2; //b210
constants.CaCl2_2H2O_g_mol = 147.0154; //b211
constants.CaCl2_2H2O_g_mL = 0.835; //b212
constants.Na2B4O7_10H2O_g_mol = 381.3756; //b213
constants.Na2B4O7_10H2O_g_mL = 1; //b214
constants.Boron_g_mol = 10.8117; //b215
constants.BoricAcidBOH3_g_mol = 61.8337; //b216
constants.CalciumHydroxideCaOH2_g_mol = 74.09315; //b217
constants.SodiumChlorideNaCl_g_mol = 58.443; //b218
constants.SodiumChlorideNaCl_g_mL = 1.154; //b219
constants.Nitrogen_g_mol = 14.0067; //b220
constants.AscorbicAcid_g_mol = 176.124836; //b221

/* iterator TODO
	find values with initial settings...
	make all equations...
*/