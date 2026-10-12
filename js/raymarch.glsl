float intersect(vec3 ro, vec3 rd, float stepFraction) {
    // A ray only hits after sampling a surface. Exhausting the fixed work budget
    // is a miss, not a surface at whichever distance the last step reached.
    float t = 0.0;
    for (int i = 0; i < MAX_ITERATIONS; ++i) {
        if (t >= max_dist) return max_dist;
        float h = surfaceDistance((ro + rd * t));
        if (h < intersection_threshold) return t;
        t += h * STEP_SIZE_CONSTANT;
    }
    return max_dist;
}
