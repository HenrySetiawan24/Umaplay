import json
import random

data = json.load(open('datasets/in_game/races.json', 'r', encoding='utf-8'))

total_race_names = len(data)
total_instances = 0
with_banner = 0
without = 0

for name, instances in data.items():
    if isinstance(instances, list):
        for inst in instances:
            total_instances += 1
            if inst.get('banner_url') or inst.get('public_banner_path'):
                with_banner += 1
            else:
                without += 1
    else:
        total_instances += 1
        if instances.get('banner_url') or instances.get('public_banner_path'):
            with_banner += 1
        else:
            without += 1

print(f'Total race names: {total_race_names}')
print(f'Total instances: {total_instances}')
print(f'With banner: {with_banner}')
print(f'Without banner: {without}')
print()

sample_keys = random.sample(list(data.keys()), min(5, len(data)))
for k in sample_keys:
    inst = data[k][0] if isinstance(data[k], list) else data[k]
    print(f'{k}')
    print(f'  banner_url: {inst.get("banner_url", "N/A")}')
    print(f'  public_banner_path: {inst.get("public_banner_path", "N/A")}')
    print(f'  surface: {inst.get("surface")}, rank: {inst.get("rank")}')
    print()
