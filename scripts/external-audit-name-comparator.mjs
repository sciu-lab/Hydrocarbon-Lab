function descriptors(name) {
  return [...name.matchAll(/\(((?:\d+)?[EZ](?:,(?:\d+)?[EZ])*)\)-/gi)]
    .flatMap((match) => match[1].split(",").map((part) => {
      const parsed = /^(\d+)?([EZ])$/i.exec(part);
      return { locant: parsed[1] ? Number(parsed[1]) : null, geometry: parsed[2].toUpperCase() };
    }));
}

function alkeneLocants(name) {
  const match = /-(\d+(?:,\d+)*)-(?:di|tri|tetra|penta|hexa)?en/i.exec(name);
  return match ? match[1].split(",").map(Number) : [];
}

function resolvedLocant(descriptor, parentLocants) {
  return descriptor.locant ?? (parentLocants.length === 1 ? parentLocants[0] : null);
}

/** Compare named E/Z geometry with the geometry actually defined by the reference structure. */
export function compareEzDescriptors({ referenceName, generatedName, structureConfigurations }) {
  const reference = descriptors(referenceName);
  const generated = descriptors(generatedName);
  const defined = structureConfigurations.filter((value) => value === "E" || value === "Z");
  const fail = (reason) => ({ status: "FAIL", reason });

  if (defined.length === 0) {
    return reference.length || generated.length
      ? fail("E/Z descriptor present on a structure without defined E/Z")
      : { status: "PASS", reason: "E/Z unspecified in structure and name" };
  }
  if (reference.length && (reference.length !== defined.length
    || reference.map((item) => item.geometry).sort().join(",") !== [...defined].sort().join(","))) {
    return fail("reference E/Z descriptors disagree with the reference structure");
  }
  if (generated.length !== defined.length) {
    return fail("required E/Z descriptor missing or repeated");
  }
  if (generated.map((item) => item.geometry).sort().join(",") !== [...defined].sort().join(",")) {
    return fail("generated E/Z configuration disagrees with the reference structure");
  }

  const referenceLocants = alkeneLocants(referenceName);
  const generatedLocants = alkeneLocants(generatedName);
  for (const item of generated) {
    if (item.locant !== null && generatedLocants.length && !generatedLocants.includes(item.locant)) {
      return fail("E/Z locant does not identify a double bond in the generated parent");
    }
  }
  if (reference.length) {
    const expected = reference.map((item) => ({
      geometry: item.geometry,
      locant: resolvedLocant(item, referenceLocants),
    }));
    const actual = generated.map((item) => ({
      geometry: item.geometry,
      locant: resolvedLocant(item, generatedLocants),
    }));
    if (expected.every((item) => item.locant !== null) && actual.every((item) => item.locant !== null)) {
      const ordered = (items) => items.sort((left, right) => left.locant - right.locant);
      if (JSON.stringify(ordered(expected)) !== JSON.stringify(ordered(actual))) {
        return fail("E/Z configuration or double-bond locant differs from the reference name");
      }
    } else if (expected.some((item, index) => item.geometry !== actual[index].geometry)) {
      return fail("E/Z configuration differs from the reference name");
    }
  }
  return { status: "PASS", reason: "E/Z descriptors agree with the reference structure and name" };
}
