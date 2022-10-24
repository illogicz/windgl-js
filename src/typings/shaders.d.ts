
declare type GlslProgram<Props extends string = string> = { program: WebGLProgram } & Record<Props, any>

declare module "*/drawParticles.glsl" {
    type Props = "u_particles_res" | "a_index" | "u_particles" | "u_matrix" | "u_wrap" | "u_size" | "u_color";
    export type DrawProgram = GlslProgram<Props>;
    export const draw: (gl: WebGLRenderingContext) => DrawProgram;
}

declare module "*/fillLayer.glsl" {
    type Props = "a_pos" | "u_matrix" | "u_offset" | "u_wrap" | "u_tex_a" | "u_tex_0" | "u_tex_1" | "u_color_ramp" | "u_color_range" | "u_color_min" | "u_opacity";
    export type FillLayerProgram = GlslProgram<Props>;
    export const fillLayer: (gl: WebGLRenderingContext) => FillLayerProgram;
}

declare module "*/tile/particles.glsl" {
    type Props = "u_wind_res" | "u_particles" | "u_wind_top_left" | "u_wind_top_center" | "u_wind_top_right" | "u_wind_middle_left" | "u_wind_middle_center" | "u_wind_middle_right" | "u_wind_bottom_left" | "u_wind_bottom_center" | "u_wind_bottom_right" | "u_wind_min" | "u_wind_max" | "u_bli_enabled" | "u_speed_max" | "u_data_matrix" | "u_offset" | "u_particles_res" | "a_pos" | "u_speed_factor" | "a_index" | "u_initialize" | "u_rand_seed" | "u_drop_rate" | "u_drop_rate_bump" | "u_offset_inverse" | "u_matrix" | "u_color_ramp";
    export type ParticleUpdateProgram = GlslProgram<Props>;
    export const particleUpdate: (gl: WebGLRenderingContext) => ParticleUpdateProgram;export type ParticleDrawProgram = GlslProgram<Props>;
    export const particleDraw: (gl: WebGLRenderingContext) => ParticleDrawProgram;
}

declare module "*/drawHeatmap.glsl" {
    type Props = "a_pos" | "u_matrix" | "u_offset" | "u_wrap" | "u_tex" | "u_output_mult";
    export type DrawProgram = GlslProgram<Props>;
    export const draw: (gl: WebGLRenderingContext) => DrawProgram;
}

declare module "*/tile/arrow.glsl" {
    type Props = "u_dimensions" | "u_speed_max" | "u_wind" | "a_corner" | "u_wind_min" | "u_wind_max" | "u_matrix" | "u_offset" | "a_pos" | "u_color_ramp" | "u_halo_color";
    export type ArrowProgram = GlslProgram<Props>;
    export const arrow: (gl: WebGLRenderingContext) => ArrowProgram;
}

declare module "*/tile/xyFill.glsl" {
    type Props = "u_wind_res" | "u_matrix" | "u_offset" | "a_pos" | "u_bli_enabled" | "u_opacity" | "u_wind" | "u_offset_inverse";
    export type XyFillProgram = GlslProgram<Props>;
    export const xyFill: (gl: WebGLRenderingContext) => XyFillProgram;
}

declare module "*/tile/sampleFill.glsl" {
    type Props = "u_wind_res" | "u_matrix" | "u_offset" | "a_pos" | "u_wind_min" | "u_wind_max" | "u_bli_enabled" | "u_speed_max" | "u_opacity" | "u_wind" | "u_color_ramp" | "u_offset_inverse";
    export type SampleFillProgram = GlslProgram<Props>;
    export const sampleFill: (gl: WebGLRenderingContext) => SampleFillProgram;
}

declare module "*/updateParticles.glsl" {
    type Props = "u_padding" | "u_offset_inverse" | "u_time_step" | "u_span_globe" | "u_render_perc" | "a_particles" | "u_particles" | "u_tex_0" | "u_tex_1" | "u_offset" | "u_tex_a" | "u_drop_rate" | "u_drop_rate_bump" | "u_rand_seed";
    export type UpdateProgram = GlslProgram<Props>;
    export const update: (gl: WebGLRenderingContext) => UpdateProgram;
}

declare module "*/applyHeatmapData.glsl" {
    type Props = "u_matrix" | "a_positions" | "a_data";
    export type ApplyProgram = GlslProgram<Props>;
    export const apply: (gl: WebGLRenderingContext) => ApplyProgram;
}

declare module "*/updateHeatmap.glsl" {
    type Props = "a_pos" | "u_tex_a" | "u_tex_0" | "u_tex_1" | "u_heatmap" | "u_hm_to_uv" | "u_resolution_met" | "u_resolution_tex" | "u_time_step" | "u_drop_off" | "u_blur_kernel";
    export type UpdateHeatmapProgram = GlslProgram<Props>;
    export const updateHeatmap: (gl: WebGLRenderingContext) => UpdateHeatmapProgram;
}

declare module "*/data/reproject.glsl" {
    type Props = "a_pos" | "u_input" | "u_transform" | "u_transform_inverse" | "u_input_size";
    export type ReprojectProgram = GlslProgram<Props>;
    export const reproject: (gl: WebGLRenderingContext) => ReprojectProgram;
}
