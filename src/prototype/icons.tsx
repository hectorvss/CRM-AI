// ─────────────────────────────────────────────────────────────────────────────
// Shared inline-SVG icon constants
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { FIGMA_CDN } from './assets';
import type { IconVariant, View } from './types';


type IconDef = { svgs: string[]; insets: string[]; rotate?: number; size: number };
const ic = (size: number, insets: string[], svgs: string[]): IconDef =>
  ({ size, insets, svgs: svgs.map(u => `${FIGMA_CDN}/${u}`) });

export const ICON_LIBRARY: Record<IconVariant, IconDef> = {
  '1':    { svgs: [`${FIGMA_CDN}/4db2ee8b-9fc6-4c57-824d-ccdb9a327847`], insets: ['30% 19.7% 32.19% 19.7%'], size: 16 },
  '2':    { svgs: [`${FIGMA_CDN}/9f16b8ea-e048-4d03-9b83-88117fb02d7b`, `${FIGMA_CDN}/933d8a94-7b30-4ce7-bb5f-720cefef3583`], insets: ['11.11%', '11.11%'], size: 18 },
  '45':   { svgs: [`${FIGMA_CDN}/b536470b-3164-4ad3-b9fd-4d6acde3d69a`], insets: ['0%'], size: 48 },
  // LibraryV2 — full 91-variant set from file QhrV4aBbAAqTxgWhaK8hGP node 3-23460
  'v2-1':  ic(16, ['30% 19.7% 32.19% 19.7%'], ['3bf9779b-49e0-4cd4-9a01-5d588d4a6946']),
  'v2-2':  ic(18, ['11.11%', '11.11%'], ['01cfa523-b10d-49e2-bd8a-4229a0e9243d', 'c8ee63b3-e943-4886-ab1d-dae6b4e037c4']),
  'v2-3':  ic(24, ['6.25%'], ['ee9a6d2e-71e9-4405-afc4-2430e5f699b7']),
  'v2-4':  ic(16, ['18.75% 6.25% 12.5% 6.25%'], ['3c743c69-437d-4865-ad65-b3ff2a523884']),
  'v2-5':  ic(16, ['6.25% 6.18% 6.19% 6.25%'], ['b3688bb3-30b0-474d-946b-57fce92570b2']),
  'v2-6':  ic(16, ['0 6.19% 1.42% 0'], ['280d64e9-d0d3-47d1-bd93-226668962231']),
  'v2-7':  ic(16, ['6.25% 12.5%'], ['7f42f314-6614-40ce-a998-2982180fb1bf']),
  'v2-8':  ic(16, ['7.42% 7.75% 7.42% 7.81%'], ['c16e8b16-e68f-4a2a-8945-14fcfd89b197']),
  'v2-9':  ic(16, ['10.94% 0 12.5% 0'], ['02dc00a6-6665-4b47-ab2d-eacfacad1cca']),
  'v2-10': ic(16, ['12.5%', '12.5%'], ['82ac3f2a-fdb8-4d6a-9aca-06851a9d5dc3', '85ba4aeb-2bd2-4514-961d-29fc9e895148']),
  'v2-11': ic(16, ['9.43% 7.77% 7.77% 9.41%'], ['1d973e66-4782-4ad5-a158-a07b7f7faa8f']),
  'v2-12': ic(16, ['6.31% 4.92% 6.18% 5.21%'], ['1c231363-e0b6-44cd-8f83-15aade5c38e0']),
  'v2-13': ic(16, ['12.5%'], ['75bd44fd-114c-4ffe-b80a-9033f0d89493']),
  'v2-14': ic(16, ['84.43% 12.44% 6.19% 12.51%','50.03% 68.73% 24.95% 12.51%','31.27% 40.58% 24.95% 40.65%','12.51% 12.44% 24.95% 68.8%','6.3% 62.52% 62.52% 6.3%'], ['69566dd3-2443-43fa-9f2d-a3cee47ed355','26876f3c-1ff8-4e8b-bea7-a7aab52a5d13','f4fface9-8270-4c8c-8084-707f8778b7a8','4b24788b-5f52-411c-a2f9-559497ed2bd4','def94264-e212-4860-ad3d-760bc008a4bc']),
  'v2-15': ic(16, ['18.75% 18.75% 15% 15%'], ['dc23cfe4-1204-4890-8292-5422ca141eb7']),
  'v2-16': ic(16, ['12.5%'], ['d8990269-7b3c-4383-b546-17db21015900']),
  'v2-17': ic(16, ['6.25% 12.5%'], ['b3dcfbbc-bd18-4021-994b-6f2023c10ae0']),
  'v2-18': ic(16, ['12.81% 6.25% 8.42% 6.25%'], ['c4cc787f-952e-4b5f-b11c-427355688e8d']),
  'v2-19': ic(16, ['22.81% 33.75%'], ['fd45ab25-5544-43d3-9d75-bc0eeb029dc1']),
  'v2-20': ic(16, ['3.87% 14.13% 31.25% 14%','78.13% 31.19% 0 31.25%'], ['7f5ff988-ec0c-40ba-b6ce-372937fe2aff','eb9cc73e-aa85-4a88-bb69-9e2655f227a1']),
  'v2-21': ic(16, ['13.56% 0.06% 12.69% 0'], ['4e74aaa1-2c3d-4342-b95f-f2faf235a385']),
  'v2-22': ic(16, ['0'], ['275cad55-cffe-49d9-aeda-1e7f0aa6f101']),
  'v2-23': ic(16, ['12.5% 6.25%'], ['04db0097-2a87-4c33-8290-115766b9d3df']),
  'v2-24': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['15c56576-e3a9-4f8c-a7d9-bb286d297b98','15c56576-e3a9-4f8c-a7d9-bb286d297b98','1b811ae9-3965-497f-972c-6a28b9d7cbf7']),
  'v2-25': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['d55cd93c-3c17-42ea-ac04-687aac17bdb4','d55cd93c-3c17-42ea-ac04-687aac17bdb4','f0a99d07-f3c0-463a-a576-3e752534c217']),
  'v2-26': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['a3367a5b-1abc-40aa-a018-8a639bd843ba','a3367a5b-1abc-40aa-a018-8a639bd843ba','617cc1bf-1439-4e37-96de-3c0ad3c22c67']),
  'v2-27': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['93e572d0-0ce9-473c-97fa-0a1bcd3ce6aa','93e572d0-0ce9-473c-97fa-0a1bcd3ce6aa','97342167-e27f-453f-be98-b39c50c093b5']),
  'v2-28': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['bed04841-c410-4ab3-a2a5-3d3a0d1971f7','bed04841-c410-4ab3-a2a5-3d3a0d1971f7','00014aaf-87dc-42a0-a76e-d02cc1c9a40d']),
  'v2-29': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['9cd61417-ac88-491a-9b57-77d685ca09dd','9cd61417-ac88-491a-9b57-77d685ca09dd','187b02e2-915d-4387-a34e-5fcae33c9704']),
  'v2-30': ic(16, ['12.5% 6.25%'], ['96f37bda-2a2a-44ae-a871-8a96cc2d0caf']),
  'v2-31': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['6faa9688-4a90-4cd0-9364-0f701a22ba90','6faa9688-4a90-4cd0-9364-0f701a22ba90','104c4e54-3a43-40da-90c7-68c5934a9482']),
  'v2-32': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['f9abaf51-eeeb-43d9-9a48-2e7a3a865945','f9abaf51-eeeb-43d9-9a48-2e7a3a865945','344ec7f8-819b-4d36-a752-26d6f2c69498']),
  'v2-33': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['33c4f19d-7167-461b-ad33-af59f009f968','33c4f19d-7167-461b-ad33-af59f009f968','5e825b45-aab8-423a-a82c-1657b950f7d2']),
  'v2-34': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['15a39957-b159-4276-a21f-5caf518b78a7','15a39957-b159-4276-a21f-5caf518b78a7','edb1b56a-65e8-4dca-a1d1-7ce1bdd10406']),
  'v2-35': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['04408711-f048-47ff-a049-e8e6808e37ca','04408711-f048-47ff-a049-e8e6808e37ca','22c17417-16d1-42a3-8255-1ba459f45821']),
  'v2-36': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['8d9772ca-d322-4b0a-ad0a-aed0d5022c4d','8d9772ca-d322-4b0a-ad0a-aed0d5022c4d','26e62f6b-5f8a-4cf6-af77-dab6742387ea']),
  'v2-37': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['9dfe5f66-6085-4055-a594-6de51d17249d','9dfe5f66-6085-4055-a594-6de51d17249d','232be821-0457-4d95-ac51-3a8a8a3099d0']),
  'v2-38': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['46937ca3-338e-4a02-acf6-b6ed2d140581','46937ca3-338e-4a02-acf6-b6ed2d140581','b23aa366-0dd5-4ca0-a78c-49fca09566b6']),
  'v2-39': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['2c705dfb-19a7-4324-82e2-23d37d215666','2c705dfb-19a7-4324-82e2-23d37d215666','99b0bef2-fbb9-4f26-9530-9139e7832f0a']),
  'v2-40': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['df8502f1-7c06-4540-9677-93e0f73b1f0d','df8502f1-7c06-4540-9677-93e0f73b1f0d','311f6822-e66f-4e85-8114-1e8437780d00']),
  'v2-41': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['8e205125-4ded-4cbf-961a-fbb838b2d562','8e205125-4ded-4cbf-961a-fbb838b2d562','eee3ed36-7200-4188-840a-7a29cc23f31a']),
  'v2-42': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['6ce54653-45c8-4cd6-9fd9-247c6857f725','6ce54653-45c8-4cd6-9fd9-247c6857f725','1362d316-66ef-4ebb-92a2-14f8e90b24bc']),
  'v2-43': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['81c463cf-6cb6-4561-bec4-fc02de477683','81c463cf-6cb6-4561-bec4-fc02de477683','670fa7b7-4e3a-48d9-b410-f717c6091dd7']),
  'v2-44': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['6993538c-7482-4a41-b1f9-3b18df2e92fa','6993538c-7482-4a41-b1f9-3b18df2e92fa','25a03379-222d-4318-b6e1-cab7623a3c4c']),
  'v2-45': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['d4cc6c6b-58ee-4260-8964-aa6d25c7a406','d4cc6c6b-58ee-4260-8964-aa6d25c7a406','3327847e-4561-4fa1-8d40-d082d6ac239f']),
  'v2-46': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['0022e793-c806-4e02-a510-fa10a8f4d5e7','0022e793-c806-4e02-a510-fa10a8f4d5e7','4c32aafa-1c91-4e32-909e-e7173cbd3600']),
  'v2-47': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['0d696791-54ce-41df-98c1-64214318811e','0d696791-54ce-41df-98c1-64214318811e','f821b305-0d59-4ded-a6f7-59ef73b86c4b']),
  'v2-48': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['6ee4a839-ced7-4eb1-b8a1-5834fe58aad1','6ee4a839-ced7-4eb1-b8a1-5834fe58aad1','1064957f-8ad2-44a1-a256-137f3d960c20']),
  'v2-49': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['cdf54640-b020-43b3-a596-42a6b8b826c0','cdf54640-b020-43b3-a596-42a6b8b826c0','08a706c2-faaf-4cd6-a1a3-b217ff01316b']),
  'v2-50': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['776472ef-aab0-4828-8a4b-a7b38bac1d52','776472ef-aab0-4828-8a4b-a7b38bac1d52','706786da-4678-4871-91b9-eeca938378bb']),
  'v2-51': ic(16, ['12.5% 6.25%'], ['150b0069-2f34-47c8-a193-252b2564f53d']),
  'v2-52': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['69ae3a4a-a318-465b-b3d6-3ab78f976f16','69ae3a4a-a318-465b-b3d6-3ab78f976f16','a92b5ae1-4712-4f13-a467-732faac2f575']),
  'v2-53': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['bd9d196a-9d31-4f41-acd3-6ef766f42b26','bd9d196a-9d31-4f41-acd3-6ef766f42b26','78c7cc46-21dd-4050-b696-a312d8805c61']),
  'v2-54': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['cb12af76-e8da-4236-af36-ce023f40edc4','cb12af76-e8da-4236-af36-ce023f40edc4','5f80fc8a-5aa9-4a89-9000-8ca3f3c28509']),
  'v2-55': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['a540de0d-331d-4956-a27e-6fc0635ffe07','a540de0d-331d-4956-a27e-6fc0635ffe07','14703441-4327-4436-8d66-e811af7de826']),
  'v2-56': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['7666e9e1-349e-4e33-bc91-f6820cff8681','7666e9e1-349e-4e33-bc91-f6820cff8681','2d8b861b-b414-47d9-8f58-39261866f258']),
  'v2-57': ic(12, ['9.38% 40.63% 71.87% 40.62%','40.63%','71.87% 40.63% 9.38% 40.62%'], ['f9c91744-258a-492a-97c7-82769152bdab','f9c91744-258a-492a-97c7-82769152bdab','9d07e9c2-6d6a-4a1b-beae-d7a24232d5dc']),
  'v2-58': ic(16, ['17.19% 12.5% 17.19% 9.37%'], ['5a95d271-3c41-43dd-aa9b-32b302367d75']),
  'v2-59': ic(16, ['12.5% 6.25%'], ['6f7880ea-9d35-4ee9-a02b-4634fc6050d3']),
  'v2-60': ic(16, ['6.25%'], ['85df45c7-cfb1-465b-a43a-9cce82602a0b']),
  'v2-61': ic(16, ['40.62% 9.37% 40.63% 9.37%'], ['67f61f2b-b88b-4726-a86a-4a5d83baffbd']),
  'v2-62': ic(16, ['5.07% 7.92% 12.5% 6.25%'], ['010d27cb-88e8-4e50-aecc-43c6ee358506']),
  'v2-63': ic(16, ['6.25% 6.75%'], ['3aff586b-735e-4017-bdbf-c68526206c7a']),
  'v2-64': ic(16, ['1.31% 6% 10.87% 6.18%'], ['3eec996a-05e5-47f9-85cf-0ce5d7ee13c0']),
  'v2-65': ic(16, ['0 6.25% 68.75% 6.25%','40.62% 6.25% 12.5% 6.25%'], ['fec6a49a-2277-45eb-b665-b04f06f4a70e','35766678-4eb8-4587-a2df-b5f48421987a']),
  'v2-66': ic(16, ['17.19%'], ['a576b540-d192-41bd-a863-ea9a29edacdc']),
  'v2-67': ic(12, ['4.17%'], ['ba82fb21-ff11-4c52-bedc-2cc1e9ab89d0']),
  'v2-68': ic(12, ['4.17%'], ['4c47cd39-b4c2-4c0d-9927-ce5d2986b90e']),
  'v2-69': ic(12, ['7.81% 7.78% 7.78% 7.81%'], ['84a66daa-135b-4896-bd49-3762b594195f']),
  'v2-70': ic(16, ['33.75% 22.81%'], ['80934a77-c666-492b-a318-097df916a9bb']),
  'v2-71': ic(12, ['7.81% 7.78% 7.78% 7.81%'], ['63711180-81f7-4f0d-a3c7-d2606c63ea4e']),
  'v2-72': ic(16, ['33.75% 22.81%'], ['809218ef-249a-48f4-8154-fb944f8ac1c4']),
  'v2-73': ic(16, ['6.25%'], ['8f1865d9-9366-4104-a4ff-952ed99fb079']),
  'v2-74': ic(16, ['6.25%'], ['83269336-c694-48db-9455-a138bfe0bc8f']),
  'v2-75': ic(16, ['6.25%'], ['c7f21fe9-5bdf-4f82-8565-8aec7d3da0b0']),
  'v2-76': ic(16, ['6.25%'], ['e63deaa6-b53c-4b83-bcf5-93231530b27c']),
  'v2-77': ic(16, ['6.25%'], ['cdddd034-8c60-48aa-ae5d-1e81fb9f53a4']),
  'v2-78': ic(16, ['6.25%'], ['0b282eb3-186a-4baa-9c5b-1ad647afba42']),
  'v2-79': ic(16, ['6.25%'], ['8074a583-cc2b-4217-9621-35931436cbc7']),
  'v2-80': ic(32, ['6.25% 12.5%'], ['11276de1-adbb-466b-a6fa-23c6e425196d']),
  'v2-81': ic(16, ['6.25%'], ['5e1cbfd4-b10d-4cfe-a3ca-edf780da9d0b']),
  'v2-82': ic(32, ['6.25% 12.5%'], ['18cc3188-3e1c-4ddc-bb84-5de178ee393b']),
  'v2-83': ic(16, ['6.25%'], ['0dc3182b-5026-4a4a-a1b3-607751516bda']),
  'v2-84': ic(48, ['0'], ['11b2c9e6-332a-47a4-8b28-7c35a8e464f5']),
  'v2-85': ic(16, ['6.25%'], ['e0c20b04-b665-4102-ac70-4a6dce51d5cd']),
  'v2-86': ic(32, ['6.25% 12.5%'], ['4da36947-9732-458e-8449-c2bc7532c8e6']),
  'v2-87': ic(16, ['6.25%'], ['a7354799-492b-49e0-96cf-b12083e8ec2d']),
  'v2-88': ic(32, ['6.25% 12.5%'], ['0b2c45aa-c47d-4218-afed-5f64ed32d54f']),
  'v2-89': ic(48, ['0'], ['05c6b5ac-29d2-4671-8c0e-c64ddab09ebf']),
  'v2-90': ic(24, ['0 6.25%'], ['8bb39ed9-d0c0-4c3c-9464-be5c76935541']),
  'v2-91': ic(26, ['33.96% 21.46%'], ['fe5e38fe-c456-450c-ad3d-a0a81637741c']),
};
const _if = (inner: string, col = '#1a1a1a') =>
  `data:image/svg+xml;base64,${btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${col}" stroke="none">${inner}</svg>`
  )}`;
export const ICON_BULLET_1   = _if('<circle cx="12" cy="12" r="5"/>');
export const ICON_BULLET_2   = _if('<rect x="8" y="8" width="8" height="8" rx="1"/>');
export const ICON_BULLET_3   = _if('<polygon points="12 5 19 19 5 19"/>');
export const ICON_BULLET_4   = _if('<polygon points="12 2 22 22 2 22"/>');

const SETTINGS_NAV_TOP = [
  { label: "Inicio",             hasChevron: false },
  { label: "Espacio de trabajo", hasChevron: true },
  { label: "Suscripción",        hasChevron: true },
  { label: "Canales",            hasChevron: true },
];
const SETTINGS_NAV_MID = [
  { label: "IA y automatización", hasChevron: true },
  { label: "Integraciones",       hasChevron: true },
];
const INBOX_SUB: { label: string; nav: View | null }[] = [
  { label: "Inbox para el equipo", nav: 'inboxTeam' },
  { label: "Asignaciones",         nav: 'assignments' },
  { label: "Macros",               nav: 'macros' },
  { label: "Folios de atención",   nav: 'tickets' },
  { label: "SLA",                  nav: 'sla' },
];
const DATOS_SUB: { label: string; nav: View | null }[] = [
  { label: "Etiquetas",                    nav: 'labels' },
  { label: "Personas",                     nav: 'people' },
  { label: "Empresas",                     nav: 'companies' },
  { label: "Conversaciones",               nav: 'settings' },
  { label: "Objetos personalizados",       nav: 'customObjects' },
  { label: "Importaciones y exportaciones", nav: 'imports' },
  { label: "Temas",                        nav: 'topics' },
];

const WORKSPACE_SUB: { label: string; nav: View | null; warn?: boolean }[] = [
  { label: "General",                nav: 'workspaceGeneral' },
  { label: "Compañeros de equipo",   nav: 'workspaceTeammates' },
  { label: "Horario de atención",    nav: 'workspaceHours' },
  { label: "Marcas",                 nav: 'workspaceBrands' },
  { label: "Seguridad",              nav: 'workspaceSecurity', warn: true },
  { label: "Multilingüe",            nav: 'workspaceMultilingual' },
];

const SUSCRIPCION_SUB: { label: string; nav: View | null }[] = [
  { label: "Facturación", nav: 'billing' },
];

const CANALES_SUB: { label: string; nav: View | null }[] = [
  { label: "Messenger",                 nav: 'messenger' },
  { label: "Correo electrónico",        nav: 'email' },
  { label: "Teléfono",                  nav: 'phone' },
  { label: "WhatsApp",                  nav: 'whatsapp' },
  { label: "Switch",                    nav: 'switchChannel' },
  { label: "Slack",                     nav: 'slackChannel' },
  { label: "Discord",                   nav: 'discord' },
  { label: "SMS",                       nav: 'sms' },
  { label: "Canales de redes sociales", nav: 'social' },
  { label: "Todos los canales",         nav: 'allChannels' },
];
const SETTINGS_NAV_BOTTOM = [
  { label: "Centro de ayuda",   hasChevron: true },
  { label: "Canales salientes", hasChevron: true },
];

const IA_SUB: { label: string; nav: View | null }[] = [
  { label: "Fin AI Agent",   nav: 'finSettings' },
  { label: "Audiences",      nav: 'audiences' },
  { label: "Buzón de IA",    nav: 'aiInbox' },
  { label: "Automatización", nav: 'automation' },
];
const INTEG_SUB: { label: string; nav: View | null }[] = [
  { label: "Tienda de aplicaciones",   nav: 'appStore' },
  { label: "Conectores de datos",      nav: 'connectors' },
  { label: "Autenticación",            nav: 'auth' },
];
const PERSONAL_SUB: { label: string; nav: View | null }[] = [
  { label: "Información",            nav: 'personal' },
  { label: "Seguridad de la cuenta", nav: 'security' },
  { label: "Notificaciones",         nav: 'notifications' },
  { label: "Visible para ti",        nav: 'visible' },
  { label: "Tokens de API",          nav: 'tokens' },
  { label: "Acceso a la cuenta",     nav: 'accountAccess' },
  { label: "Multilingüe",           nav: 'multilingual' },
];
