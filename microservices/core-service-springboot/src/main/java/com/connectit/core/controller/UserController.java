package com.connectit.core.controller;

import com.connectit.core.model.User;
import com.connectit.core.service.UserService;
import com.connectit.core.service.EmailService;
import com.connectit.core.util.SimpleHash;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final EmailService emailService;

    @GetMapping("/users")
    public ResponseEntity<?> list(@RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        // Check if requester has permission to view all users
        if (requesterUid == null || requesterUid.isBlank()) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized: User session not found."));
        }
        
        User requester = userService.findByUid(requesterUid)
            .orElseThrow(() -> new RuntimeException("Requester not found: " + requesterUid));
        
        // Check if requester has permission to view all users
        if (!hasPermissionToViewAllUsers(requester)) {
            return ResponseEntity.status(403).body(Map.of("error", "Forbidden: You don't have permission to view all users."));
        }
        
        return ResponseEntity.ok(userService.findAll().stream().map(this::serialize).toList());
    }

    @GetMapping("/users/{uid}")
    public ResponseEntity<?> get(@PathVariable String uid, @RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        if (requesterUid == null || requesterUid.isBlank()) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized: User session not found."));
        }
        
        User requester = userService.findByUid(requesterUid)
            .orElseThrow(() -> new RuntimeException("Requester not found: " + requesterUid));
        
        User target = userService.findByUid(uid)
            .orElseThrow(() -> new RuntimeException("User not found: " + uid));
        
        // Check if requester has permission to view target user's data
        if (!hasPermissionToViewUser(requester, target)) {
            return ResponseEntity.status(403).body(Map.of("error", "Forbidden: You don't have permission to view this user's data."));
        }
        
        return ResponseEntity.ok((Object) serialize(target));
    }

    @PostMapping("/users")
    public ResponseEntity<?> create(@RequestBody Map<String,Object> body,
                                    @RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        if (requesterUid == null || requesterUid.isBlank()) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized: User session not found."));
        }
        
        User requester = userService.findByUid(requesterUid)
            .orElseThrow(() -> new RuntimeException("Requester not found: " + requesterUid));
        
        // Check if requester has permission to create users
        if (!hasPermissionToCreateUsers(requester)) {
            return ResponseEntity.status(403).body(Map.of("error", "Forbidden: You don't have permission to create users."));
        }
        
        try {
            User user = User.builder()
                .uid((String) body.get("uid"))
                .name((String) body.get("name"))
                .email(((String) body.get("email")).toLowerCase().trim())
                .role((String) body.getOrDefault("role","user"))
                .phone((String) body.get("phone"))
                .department((String) body.get("department"))
                .isActive(body.get("is_active") == null || Boolean.parseBoolean(body.get("is_active").toString()))
                .isDemo(Boolean.parseBoolean(body.getOrDefault("is_demo","false").toString()))
                .passwordHash(body.get("password_hash") != null
                    ? (String) body.get("password_hash")
                    : body.get("password") != null ? SimpleHash.hash((String) body.get("password")) : null)
                .restrictedModules(body.get("restrictedModules") != null ? (String) body.get("restrictedModules") : null)
                .build();
            return ResponseEntity.status(201).body(serialize(userService.create(user)));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error","Failed to create user: " + e.getMessage()));
        }
    }

    @PutMapping("/users/{uid}")
    public ResponseEntity<?> update(@PathVariable String uid, @RequestBody Map<String,Object> body, 
                                   @RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        if (requesterUid == null || requesterUid.isBlank()) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized: User session not found."));
        }
        
        User requester = userService.findByUid(requesterUid)
            .orElseThrow(() -> new RuntimeException("Requester not found: " + requesterUid));
        
        User target = userService.findByUid(uid)
            .orElseThrow(() -> new RuntimeException("User not found: " + uid));
        
        // Check if requester has permission to update target user
        if (!hasPermissionToUpdateUser(requester, target)) {
            return ResponseEntity.status(403).body(Map.of("error", "Forbidden: You don't have permission to update this user's data."));
        }
        
        try {
            User updates = new User();
            if (body.get("name")       != null) updates.setName((String) body.get("name"));
            if (body.get("email")      != null) updates.setEmail((String) body.get("email"));
            if (body.get("role")       != null) updates.setRole((String) body.get("role"));
            if (body.get("phone")      != null) updates.setPhone((String) body.get("phone"));
            if (body.get("department") != null) updates.setDepartment((String) body.get("department"));
            if (body.get("is_active")  != null) updates.setIsActive(Boolean.parseBoolean(body.get("is_active").toString()));
            if (body.get("password")   != null) updates.setPasswordHash(SimpleHash.hash((String) body.get("password")));
            if (body.get("password_hash") != null) updates.setPasswordHash((String) body.get("password_hash"));
            if (body.get("restrictedModules") != null) updates.setRestrictedModules((String) body.get("restrictedModules"));
            return ResponseEntity.ok(serialize(userService.update(uid, updates)));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error","Failed to update user: " + e.getMessage()));
        }
    }

    @DeleteMapping("/users/{uid}")
    public ResponseEntity<?> delete(@PathVariable String uid, 
                                   @RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        if (requesterUid == null || requesterUid.isBlank()) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized: User session not found."));
        }
        
        User requester = userService.findByUid(requesterUid)
            .orElseThrow(() -> new RuntimeException("Requester not found: " + requesterUid));
        
        User target = userService.findByUid(uid)
            .orElseThrow(() -> new RuntimeException("User not found: " + uid));
        
        // Check if requester has permission to delete target user
        if (!hasPermissionToUpdateUser(requester, target)) {
            return ResponseEntity.status(403).body(Map.of("error", "Forbidden: You don't have permission to delete this user."));
        }
        
        userService.softDelete(uid);
        return ResponseEntity.ok(Map.of("success",true));
    }

    @PostMapping("/users/reset-password")
    public ResponseEntity<?> resetPassword(
            @RequestBody Map<String, String> body,
            @RequestHeader(value = "x-user-uid", required = false) String headerUid) {
        String currentPassword = body.get("currentPassword");
        String newPassword = body.get("newPassword");
        String confirmNewPassword = body.get("confirmNewPassword");

        if (currentPassword == null || newPassword == null || confirmNewPassword == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "All fields are required."));
        }

        if (headerUid == null || headerUid.isBlank()) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized: User session not found."));
        }

        User user = userService.findByUid(headerUid)
            .orElseThrow(() -> new RuntimeException("User not found: " + headerUid));

        // Users can only reset their own password
        // (No need to check role hierarchy since this is self-service)

        // 1. Verify current password
        Optional<User> authUserOpt = userService.authenticate(user.getEmail(), currentPassword);
        if (authUserOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Incorrect current password."));
        }

        // 2. Ensure new password and confirm password match
        if (!newPassword.equals(confirmNewPassword)) {
            return ResponseEntity.badRequest().body(Map.of("error", "New password and confirm password do not match."));
        }

        // 3. Prevent weak or invalid passwords based on existing password policies
        if (newPassword.length() < 6) {
            return ResponseEntity.badRequest().body(Map.of("error", "New password must be at least 6 characters."));
        }

        try {
            // 4. Encrypt/hash passwords using the current security implementation
            String newHash = SimpleHash.hash(newPassword);
            
            User updates = new User();
            updates.setPasswordHash(newHash);
            userService.update(user.getUid(), updates);

            // 5. (Audit logging skipped - password reset is a user self-service action)

            // 6. Send password change email notification
            String emailBody = emailService.buildTemplate(
                "Password Changed",
                null,
                "<p>Hello " + user.getName() + ",</p>" +
                "<p>The password for your Connect IT account has been successfully changed.</p>" +
                "<p>If you did not make this change, please contact your administrator immediately.</p>",
                null
            );
            emailService.sendAsync(user.getEmail(), "Connect IT - Password Reset Successful", emailBody);

            return ResponseEntity.ok(Map.of("success", true, "message", "Password reset successfully."));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Failed to reset password: " + e.getMessage()));
        }
    }

    private Map<String,Object> serialize(User u) {
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("id",          String.valueOf(u.getId()));
        m.put("uid",         u.getUid());
        m.put("name",        u.getName());
        m.put("email",       u.getEmail());
        m.put("role",        u.getRole());
        m.put("phone",       u.getPhone());
        m.put("department",  u.getDepartment());
        m.put("is_active",   u.getIsActive());
        m.put("is_demo",     u.getIsDemo());
        m.put("created_at",  u.getCreatedAt());
        m.put("last_login",  u.getLastLogin());
        m.put("restrictedModules", u.getRestrictedModules());
        return m;
    }

    // Helper methods for permission checking
    private boolean hasPermissionToViewAllUsers(User user) {
        String role = user.getRole();
        // Ultra Super Admin, Super Admin, Admin, Sub Admin, Agent can view all users
        return role.equals("ultra_super_admin") || 
               role.equals("super_admin") || 
               role.equals("admin") || 
               role.equals("sub_admin") || 
               role.equals("agent");
    }

    private boolean hasPermissionToViewUser(User requester, User target) {
        // Users can always view their own data
        if (requester.getUid().equals(target.getUid())) {
            return true;
        }
        
        // Check role hierarchy
        String requesterRole = requester.getRole();
        String targetRole = target.getRole();
        
        // Ultra Super Admin can view anyone
        if (requesterRole.equals("ultra_super_admin")) {
            return true;
        }
        
        // Super Admin can view anyone except Ultra Super Admin
        if (requesterRole.equals("super_admin") && !targetRole.equals("ultra_super_admin")) {
            return true;
        }
        
        // Admin can view anyone except Super Admin and Ultra Super Admin
        if (requesterRole.equals("admin") && !targetRole.equals("super_admin") && !targetRole.equals("ultra_super_admin")) {
            return true;
        }
        
        // Sub Admin can view anyone except Admin, Super Admin, Ultra Super Admin
        if (requesterRole.equals("sub_admin") && !targetRole.equals("admin") && !targetRole.equals("super_admin") && !targetRole.equals("ultra_super_admin")) {
            return true;
        }
        
        // Agent can view anyone except Admin, Super Admin, Ultra Super Admin
        if (requesterRole.equals("agent") && !targetRole.equals("admin") && !targetRole.equals("super_admin") && !targetRole.equals("ultra_super_admin")) {
            return true;
        }
        
        return false;
    }

    private boolean hasPermissionToUpdateUser(User requester, User target) {
        // Users can always update their own data
        if (requester.getUid().equals(target.getUid())) {
            return true;
        }
        
        // Check role hierarchy
        String requesterRole = requester.getRole();
        String targetRole = target.getRole();
        
        // Ultra Super Admin can update anyone
        if (requesterRole.equals("ultra_super_admin")) {
            return true;
        }
        
        // Super Admin can update anyone except Ultra Super Admin
        if (requesterRole.equals("super_admin") && !targetRole.equals("ultra_super_admin")) {
            return true;
        }
        
        // Admin can update anyone except Super Admin and Ultra Super Admin
        if (requesterRole.equals("admin") && !targetRole.equals("super_admin") && !targetRole.equals("ultra_super_admin")) {
            return true;
        }
        
        // Sub Admin can update anyone except Admin, Super Admin, Ultra Super Admin
        if (requesterRole.equals("sub_admin") && !targetRole.equals("admin") && !targetRole.equals("super_admin") && !targetRole.equals("ultra_super_admin")) {
            return true;
        }
        
        return false;
    }

    private boolean hasPermissionToCreateUsers(User user) {
        String role = user.getRole();
        // Ultra Super Admin, Super Admin, Admin, Sub Admin, Agent can create users
        return role.equals("ultra_super_admin") || 
               role.equals("super_admin") || 
               role.equals("admin") || 
               role.equals("sub_admin") || 
               role.equals("agent");
    }
}
