;nyquist plug-in
;version 4
;type tool
;name "Previous Slice"
;author "Kumbengo Lab"
;release 1.0

(setf labels (second (first (aud-get-info "Labels"))))
(setf now (get '*selection* 'start))

(defun select-region (start end)
  (aud-do (format nil "Select:Start=~a End=~a Mode=Set" start end))
  (aud-do "PlaySelectedRegion:")
  "")

(defun get-label-time (i)
  (first (nth i labels)))

(defun find-current-index ()
  (do ((j 0 (1+ j)))
      ((or (>= j (length labels))
           (>= (get-label-time j) now))
       j)))

(cond
  ((< (length labels) 1)
   "No labels found.")
  (t
   (let ((idx (find-current-index)))
     (if (> idx 1)
         (select-region (get-label-time (- idx 2)) (get-label-time (1- idx)))
         (if (> idx 0)
             (select-region 0 (get-label-time 0))
             "Already at the first slice")))))
