
declare type GlslProgram<Props extends string = string> = { program: WebGLProgram } & Record<Props, any>

declare module "*/drawParticles.glslx" {
    type Props = "u_particles_res" | "u_offset" | "a_index" | "u_particles" | "u_wrap" | "u_scale" | "u_size" | "u_color";
    
    export const drawVertex: string;
    export const drawFragment: string;
    export type DrawProgram = GlslProgram<Props>;
    export const draw: (gl: WebGLRenderingContext) => DrawProgram;
}

declare module "*/drawHeatmap.glslx" {
    type Props = "a_pos" | "u_transform" | "u_output_mult" | "u_output_alpha" | "u_tex";
    
    export const drawVertex: string;
    export const drawFragment: string;
    export type DrawProgram = GlslProgram<Props>;
    export const draw: (gl: WebGLRenderingContext) => DrawProgram;
}

declare module "*/fillLayer.glslx" {
    type Props = "a_pos" | "u_tex_a" | "u_tex_0" | "u_tex_1" | "u_color_range" | "u_color_min" | "u_matrix" | "u_offset" | "u_wrap" | "u_color_ramp" | "u_opacity";
    
    export const fillLayerVertex: string;
    export const fillLayerFragment: string;
    export type FillLayerProgram = GlslProgram<Props>;
    export const fillLayer: (gl: WebGLRenderingContext) => FillLayerProgram;
}

declare module "*/arrowLayer.glslx" {
    type Props = "u_dimensions" | "a_index" | "u_screen_to_coord" | "u_coord_to_uv" | "u_uv_to_coord" | "a_vert" | "u_tex_a" | "u_tex_0" | "u_tex_1" | "u_color_ramp" | "u_color_range" | "u_color_min";
    
    export const arrowVertex: string;
    export const arrowFragment: string;
    export type ArrowProgram = GlslProgram<Props>;
    export const arrow: (gl: WebGLRenderingContext) => ArrowProgram;
}

declare module "*/updateHeatmap.glslx" {
    type Props = "u_tex_a" | "u_tex_0" | "u_tex_1" | "u_hm_to_uv" | "u_resolution_met" | "u_time_step" | "u_resolution_tex" | "a_pos" | "u_drop_off" | "u_heatmap";
    
    export const updateHeatmapVertex: string;
    export const updateHeatmapFragment: string;
    export type UpdateHeatmapProgram = GlslProgram<Props>;
    export const updateHeatmap: (gl: WebGLRenderingContext) => UpdateHeatmapProgram;
}

declare module "*/applyHeatmapData.glslx" {
    type Props = "u_matrix" | "a_positions" | "u_fade" | "u_diameter" | "a_data";
    
    export const applyVertex: string;
    export const applyFragment: string;
    export type ApplyProgram = GlslProgram<Props>;
    export const apply: (gl: WebGLRenderingContext) => ApplyProgram;
}

declare module "*/updateParticles.glslx" {
    type Props = "u_padding" | "u_time_step" | "u_offset_inverse" | "u_particles" | "u_tex_0" | "u_tex_1" | "u_tex_a" | "u_offset" | "u_span_globe" | "u_drop_rate" | "u_drop_rate_bump" | "u_rand_seed" | "u_render_perc" | "a_particles";
    
    export const updateVertex: string;
    export const updateFragment: string;
    export type UpdateProgram = GlslProgram<Props>;
    export const update: (gl: WebGLRenderingContext) => UpdateProgram;
}

declare module "*/data/reproject.glslx" {
    type Props = "u_input" | "a_pos" | "u_transform_inverse" | "u_input_size" | "u_transform";
    
    export const reprojectVertex: string;
    export const reprojectFragment: string;
    export type ReprojectProgram = GlslProgram<Props>;
    export const reproject: (gl: WebGLRenderingContext) => ReprojectProgram;
}
